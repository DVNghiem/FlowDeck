/**
 * Delegation Budget Service
 *
 * Per-run envelope for tool calls, delegation depth, and same-step retries.
 * All state is kept in memory; final budget snapshots are persisted to the
 * run trace on run end via a stubbed persistence call.
 *
 * The service is advisory by default. Callers decide whether to honour the
 * budget result.
 */

import type { FlowDeckConfig } from "../config/schema"

export interface DelegationBudgetConfig {
  maxToolCalls: number
  maxDepth: number
  maxSameStepRetries: number
}

export interface DelegationBudget {
  runId: string
  config: DelegationBudgetConfig
  spentToolCalls: number
  currentDepth: number
  sameStepRetries: number
}

export interface SpendResult {
  ok: boolean
  remaining: number
}

export interface DelegationBudgetSnapshot {
  runId: string
  maxToolCalls: number
  maxDepth: number
  maxSameStepRetries: number
  spentToolCalls: number
  currentDepth: number
  sameStepRetries: number
  remainingToolCalls: number
}

const DEFAULT_BUDGET_CONFIG: DelegationBudgetConfig = {
  maxToolCalls: 200,
  maxDepth: 3,
  maxSameStepRetries: 3,
}

const budgets = new Map<string, DelegationBudget>()

export function resolveDelegationBudgetConfig(
  config?: FlowDeckConfig,
): DelegationBudgetConfig {
  const incoming = config?.governance?.delegationBudget ?? {}
  return {
    maxToolCalls: incoming.maxToolCalls ?? DEFAULT_BUDGET_CONFIG.maxToolCalls,
    maxDepth: incoming.maxDepth ?? DEFAULT_BUDGET_CONFIG.maxDepth,
    maxSameStepRetries:
      incoming.maxSameStepRetries ?? DEFAULT_BUDGET_CONFIG.maxSameStepRetries,
  }
}

export function init(runId: string, config?: FlowDeckConfig): DelegationBudget {
  const resolved = resolveDelegationBudgetConfig(config)
  const budget: DelegationBudget = {
    runId,
    config: resolved,
    spentToolCalls: 0,
    currentDepth: 0,
    sameStepRetries: 0,
  }
  budgets.set(runId, budget)
  return budget
}

export function getBudget(runId: string): DelegationBudgetSnapshot | null {
  const budget = budgets.get(runId)
  if (!budget) return null
  return toSnapshot(budget)
}

export function checkSpend(runId: string, toolName?: string): SpendResult {
  const budget = budgets.get(runId)
  if (!budget) {
    return { ok: false, remaining: 0 }
  }

  const remaining = budget.config.maxToolCalls - budget.spentToolCalls
  if (remaining <= 0) {
    return { ok: false, remaining: 0 }
  }

  budget.spentToolCalls += 1
  return { ok: true, remaining: remaining - 1 }
}

export function recordDelegation(parentRunId: string, childRunId: string): boolean {
  const parent = budgets.get(parentRunId)
  if (!parent) return false

  const child = budgets.get(childRunId) ?? init(childRunId)
  // Inherit the parent's budget envelope so depth limits are evaluated against
  // the root run's configuration across the whole delegation chain.
  child.config = parent.config
  child.currentDepth = parent.currentDepth + 1
  budgets.set(childRunId, child)

  return child.currentDepth <= child.config.maxDepth
}

export function incrementSameStepRetry(runId: string): boolean {
  const budget = budgets.get(runId)
  if (!budget) return false
  budget.sameStepRetries += 1
  return budget.sameStepRetries <= budget.config.maxSameStepRetries
}

export function resetSameStepRetry(runId: string): void {
  const budget = budgets.get(runId)
  if (budget) {
    budget.sameStepRetries = 0
  }
}

export function toSnapshot(budget: DelegationBudget): DelegationBudgetSnapshot {
  return {
    runId: budget.runId,
    maxToolCalls: budget.config.maxToolCalls,
    maxDepth: budget.config.maxDepth,
    maxSameStepRetries: budget.config.maxSameStepRetries,
    spentToolCalls: budget.spentToolCalls,
    currentDepth: budget.currentDepth,
    sameStepRetries: budget.sameStepRetries,
    remainingToolCalls: Math.max(0, budget.config.maxToolCalls - budget.spentToolCalls),
  }
}

/** Stub persistence call: writes the final budget snapshot into the run trace. */
export function persistBudget(runId: string, dir?: string): boolean {
  const budget = budgets.get(runId)
  if (!budget) return false
  // Intentionally a stub. Phase 4 will wire real persistence via StatePersistenceService.
  return true
}

/** Release the in-memory budget for a run. */
export function end(runId: string): DelegationBudgetSnapshot | null {
  const budget = budgets.get(runId)
  if (!budget) return null
  const snapshot = toSnapshot(budget)
  persistBudget(runId)
  budgets.delete(runId)
  return snapshot
}

/** Clear all in-memory budgets. Useful for tests. */
export function clearAllBudgets(): void {
  budgets.clear()
}

/** Return the number of active in-memory budgets. Useful for tests/telemetry. */
export function activeBudgetCount(): number {
  return budgets.size
}
