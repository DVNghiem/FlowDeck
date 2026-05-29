/**
 * Cost Budget Service
 *
 * Enforces per-workflow cost and token ceilings.
 * Complements delegation-budget.ts (which counts calls/retries/depth) by tracking
 * estimated USD spend and token consumption across a workflow run.
 *
 * Usage:
 *   const result = checkCostBudget(dir, workflowId, { inputTokensDelta: 5000, costUSDDelta: 0.015 }, cfg)
 *   if (result.status === "exhausted") throw new Error(result.message)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { loadFlowDeckConfig } from "../config"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostBudgetState {
  workflow_id: string
  run_id: string
  started_at: string
  total_input_tokens: number
  total_output_tokens: number
  total_est_cost_usd: number
  call_count: number
}

export type CostBudgetStatus = "ok" | "warned" | "exhausted"

export interface CostBudgetCheckResult {
  status: CostBudgetStatus
  message: string
  state: CostBudgetState
}

export interface CostDelta {
  inputTokensDelta?: number
  outputTokensDelta?: number
  costUSDDelta?: number
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function budgetPath(dir: string): string {
  return join(codebaseDir(dir), "COST_BUDGETS.json")
}

function loadBudgets(dir: string): Record<string, CostBudgetState> {
  const p = budgetPath(dir)
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Record<string, CostBudgetState>
  } catch {
    return {}
  }
}

function saveBudgets(dir: string, budgets: Record<string, CostBudgetState>): void {
  const p = budgetPath(dir)
  mkdirSync(join(p, ".."), { recursive: true })
  writeFileSync(p, JSON.stringify(budgets, null, 2), "utf-8")
}

function getOrCreateState(
  budgets: Record<string, CostBudgetState>,
  workflowId: string,
  runId: string,
): CostBudgetState {
  const key = `${workflowId}::${runId}`
  if (!budgets[key]) {
    budgets[key] = {
      workflow_id: workflowId,
      run_id: runId,
      started_at: new Date().toISOString(),
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_est_cost_usd: 0,
      call_count: 0,
    }
  }
  return budgets[key]
}

// ─── Core check ──────────────────────────────────────────────────────────────

/**
 * Apply a delta to the running budget state and check against configured limits.
 * If no governance.costBudget is configured, always returns "ok".
 *
 * @param dir         - project directory (for loading config and persisting state)
 * @param workflowId  - e.g. the GSD run id or workflow name
 * @param runId       - a unique id for this invocation (e.g. sessionID)
 * @param delta       - tokens/cost consumed by the current call
 * @param cfg         - optional pre-loaded budget config (avoids re-reading flowdeck.json)
 */
export function checkCostBudget(
  dir: string,
  workflowId: string,
  runId: string,
  delta: CostDelta,
  cfg?: ReturnType<typeof loadFlowDeckConfig>,
): CostBudgetCheckResult {
  const config = cfg ?? loadFlowDeckConfig(dir)
  const budget = config.governance?.costBudget

  // Load and apply delta
  const budgets = loadBudgets(dir)
  const state = getOrCreateState(budgets, workflowId, runId)
  state.total_input_tokens += delta.inputTokensDelta ?? 0
  state.total_output_tokens += delta.outputTokensDelta ?? 0
  state.total_est_cost_usd += delta.costUSDDelta ?? 0
  state.call_count += 1
  saveBudgets(dir, budgets)

  // No budget configured — always allow
  if (!budget) {
    return { status: "ok", message: "No cost budget configured.", state }
  }

  const onExhaustion = budget.onExhaustion ?? "warn"

  // Check limits
  const violations: string[] = []

  if (budget.maxEstimatedCostUSD !== undefined && state.total_est_cost_usd > budget.maxEstimatedCostUSD) {
    violations.push(
      `Estimated cost $${state.total_est_cost_usd.toFixed(4)} exceeds limit $${budget.maxEstimatedCostUSD.toFixed(4)}`,
    )
  }
  if (budget.maxInputTokens !== undefined && state.total_input_tokens > budget.maxInputTokens) {
    violations.push(
      `Input tokens ${state.total_input_tokens.toLocaleString()} exceeds limit ${budget.maxInputTokens.toLocaleString()}`,
    )
  }
  if (budget.maxOutputTokens !== undefined && state.total_output_tokens > budget.maxOutputTokens) {
    violations.push(
      `Output tokens ${state.total_output_tokens.toLocaleString()} exceeds limit ${budget.maxOutputTokens.toLocaleString()}`,
    )
  }

  if (violations.length === 0) {
    return { status: "ok", message: "Within budget.", state }
  }

  const detail = violations.join("; ")

  if (onExhaustion === "warn") {
    console.warn(`[flowdeck:cost-budget] WARNING — ${detail}`)
    return { status: "warned", message: `Cost budget warning: ${detail}`, state }
  }

  // "stop" or "escalate" — both return "exhausted" so callers can act
  return {
    status: "exhausted",
    message: `Cost budget exhausted (${onExhaustion}): ${detail}`,
    state,
  }
}

/**
 * Read the current accumulated state for a workflow run without applying a delta.
 * Returns null if no state exists yet.
 */
export function getCostBudgetState(
  dir: string,
  workflowId: string,
  runId: string,
): CostBudgetState | null {
  const budgets = loadBudgets(dir)
  return budgets[`${workflowId}::${runId}`] ?? null
}

/**
 * Reset the budget state for a workflow run (e.g. at start of a new run).
 */
export function resetCostBudget(dir: string, workflowId: string, runId: string): void {
  const budgets = loadBudgets(dir)
  delete budgets[`${workflowId}::${runId}`]
  saveBudgets(dir, budgets)
}
