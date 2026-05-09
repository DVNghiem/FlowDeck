/**
 * Delegation Budget Manager
 * Tracks and enforces per-run limits on tool calls, delegations, retries, and depth.
 * Stored in .codebase/BUDGETS.json.
 * When a limit is reached the run should stop, escalate, or enter fallback mode.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { loadFlowDeckConfig } from "../config"

export type BudgetStatus = "active" | "warning" | "exhausted" | "completed"

export interface BudgetLimits {
  maxToolCalls: number
  maxDelegatedAgents: number
  maxRetries: number
  maxDepth: number
  maxSameStepRetries: number
}

export interface BudgetConsumed {
  toolCalls: number
  delegatedAgents: number
  retries: number
  maxDepthReached: number
  /** step_id → retry count */
  sameStepRetries: Record<string, number>
}

export interface DelegationBudget {
  run_id: string
  session_id: string
  created_at: string
  updated_at: string
  limits: BudgetLimits
  consumed: BudgetConsumed
  status: BudgetStatus
  exhaustion_reason?: string
}

export interface BudgetCheckResult {
  allowed: boolean
  warning: boolean
  reason?: string
}

interface BudgetsStore {
  budgets: DelegationBudget[]
}

const DEFAULT_LIMITS: BudgetLimits = {
  maxToolCalls: 200,
  maxDelegatedAgents: 30,
  maxRetries: 10,
  maxDepth: 8,
  maxSameStepRetries: 3,
}

const EMPTY_CONSUMED: BudgetConsumed = {
  toolCalls: 0,
  delegatedAgents: 0,
  retries: 0,
  maxDepthReached: 0,
  sameStepRetries: {},
}

function budgetsPath(dir: string): string {
  return join(codebaseDir(dir), "BUDGETS.json")
}

function loadStore(dir: string): BudgetsStore {
  const p = budgetsPath(dir)
  if (!existsSync(p)) return { budgets: [] }
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as BudgetsStore
  } catch {
    return { budgets: [] }
  }
}

function saveStore(dir: string, store: BudgetsStore): void {
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
  writeFileSync(budgetsPath(dir), JSON.stringify(store, null, 2), "utf-8")
}

function resolveLimits(directory: string): BudgetLimits {
  try {
    const config = loadFlowDeckConfig(directory)
    const gb = (config as Record<string, unknown> & {
      governance?: { delegationBudget?: Partial<BudgetLimits> }
    })?.governance?.delegationBudget
    if (!gb) return DEFAULT_LIMITS
    return {
      maxToolCalls: gb.maxToolCalls ?? DEFAULT_LIMITS.maxToolCalls,
      maxDelegatedAgents: gb.maxDelegatedAgents ?? DEFAULT_LIMITS.maxDelegatedAgents,
      maxRetries: gb.maxRetries ?? DEFAULT_LIMITS.maxRetries,
      maxDepth: gb.maxDepth ?? DEFAULT_LIMITS.maxDepth,
      maxSameStepRetries: gb.maxSameStepRetries ?? DEFAULT_LIMITS.maxSameStepRetries,
    }
  } catch {
    return DEFAULT_LIMITS
  }
}

function mutate(
  dir: string,
  run_id: string,
  fn: (b: DelegationBudget) => DelegationBudget,
): DelegationBudget | null {
  const store = loadStore(dir)
  const idx = store.budgets.findLastIndex(b => b.run_id === run_id)
  if (idx === -1) return null
  store.budgets[idx] = { ...fn(store.budgets[idx]), updated_at: new Date().toISOString() }
  saveStore(dir, store)
  return store.budgets[idx]
}

export function createBudget(
  dir: string,
  run_id: string,
  session_id = "session-0",
): DelegationBudget {
  const store = loadStore(dir)
  const budget: DelegationBudget = {
    run_id,
    session_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    limits: resolveLimits(dir),
    consumed: { ...EMPTY_CONSUMED, sameStepRetries: {} },
    status: "active",
  }
  store.budgets.push(budget)
  saveStore(dir, store)
  return budget
}

export function getBudget(dir: string, run_id: string): DelegationBudget | null {
  return loadStore(dir).budgets.findLast(b => b.run_id === run_id) ?? null
}

export function isBudgetExhausted(dir: string, run_id: string): boolean {
  return getBudget(dir, run_id)?.status === "exhausted"
}

/**
 * Increment tool call counter. Returns whether the call is allowed.
 */
export function recordToolCall(dir: string, run_id: string): BudgetCheckResult {
  const budget = getBudget(dir, run_id)
  if (!budget) return { allowed: true, warning: false }

  const newCount = budget.consumed.toolCalls + 1
  const pct = newCount / budget.limits.maxToolCalls
  const exhausted = newCount >= budget.limits.maxToolCalls

  mutate(dir, run_id, b => ({
    ...b,
    consumed: { ...b.consumed, toolCalls: newCount },
    status: exhausted ? "exhausted" : pct > 0.8 ? "warning" : b.status,
    exhaustion_reason: exhausted
      ? `Tool call limit reached (${newCount}/${budget.limits.maxToolCalls})`
      : b.exhaustion_reason,
  }))

  return {
    allowed: !exhausted,
    warning: pct > 0.8,
    reason: exhausted ? `Tool call budget exhausted (${newCount}/${budget.limits.maxToolCalls})` : undefined,
  }
}

/**
 * Increment delegation counter and track max depth.
 */
export function recordDelegation(dir: string, run_id: string, depth: number): BudgetCheckResult {
  const budget = getBudget(dir, run_id)
  if (!budget) return { allowed: true, warning: false }

  const newCount = budget.consumed.delegatedAgents + 1
  const depthExceeded = depth > budget.limits.maxDepth
  const countExceeded = newCount >= budget.limits.maxDelegatedAgents

  mutate(dir, run_id, b => ({
    ...b,
    consumed: {
      ...b.consumed,
      delegatedAgents: newCount,
      maxDepthReached: Math.max(b.consumed.maxDepthReached, depth),
    },
    status: depthExceeded || countExceeded ? "exhausted" : b.status,
    exhaustion_reason: depthExceeded
      ? `Delegation depth ${depth} exceeds limit ${budget.limits.maxDepth}`
      : countExceeded
        ? `Delegated agent count (${newCount}) exceeds limit (${budget.limits.maxDelegatedAgents})`
        : budget.exhaustion_reason,
  }))

  return {
    allowed: !depthExceeded && !countExceeded,
    warning: newCount / budget.limits.maxDelegatedAgents > 0.8,
    reason: depthExceeded
      ? `Delegation depth ${depth} exceeds max depth ${budget.limits.maxDepth}`
      : countExceeded
        ? `Delegation count limit (${budget.limits.maxDelegatedAgents}) reached`
        : undefined,
  }
}

/**
 * Increment retry counter for a specific step. Enforces both per-step and total limits.
 */
export function recordRetry(dir: string, run_id: string, step_id: string): BudgetCheckResult {
  const budget = getBudget(dir, run_id)
  if (!budget) return { allowed: true, warning: false }

  const newTotal = budget.consumed.retries + 1
  const stepCount = (budget.consumed.sameStepRetries[step_id] ?? 0) + 1
  const totalExceeded = newTotal >= budget.limits.maxRetries
  const stepExceeded = stepCount >= budget.limits.maxSameStepRetries

  mutate(dir, run_id, b => ({
    ...b,
    consumed: {
      ...b.consumed,
      retries: newTotal,
      sameStepRetries: { ...b.consumed.sameStepRetries, [step_id]: stepCount },
    },
    status: totalExceeded || stepExceeded ? "exhausted" : b.status,
    exhaustion_reason: stepExceeded
      ? `Step "${step_id}" retried ${stepCount} times (limit: ${budget.limits.maxSameStepRetries})`
      : totalExceeded
        ? `Total retry budget (${budget.limits.maxRetries}) exhausted`
        : budget.exhaustion_reason,
  }))

  return {
    allowed: !totalExceeded && !stepExceeded,
    warning: newTotal / budget.limits.maxRetries > 0.8,
    reason: stepExceeded
      ? `Step "${step_id}" retry limit (${budget.limits.maxSameStepRetries}) reached`
      : totalExceeded
        ? `Total retry budget (${budget.limits.maxRetries}) exhausted`
        : undefined,
  }
}

export function completeBudget(dir: string, run_id: string): void {
  mutate(dir, run_id, b => ({ ...b, status: "completed" }))
}
