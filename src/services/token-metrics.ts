/**
 * Token Metrics Service
 *
 * Tracks model call counts, estimated token usage, cache hit rates,
 * and context sizes across workflow stages.
 *
 * Uses append-only JSONL for concurrency safety (parallel council/pipeline calls).
 * Persists to .codebase/TOKEN_METRICS.jsonl.
 *
 * Token estimate: ~4 chars per token for English text (rough, good for relative comparisons).
 */
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"

export type WorkflowStage =
  | "discuss"
  | "plan"
  | "execute"
  | "verify"
  | "design"
  | "fix-bug"
  | "write-docs"
  | "council"
  | "delegate"
  | "pipeline"
  | "exploration"
  | "unknown"

export type MetricEventType =
  | "model_call"
  | "cache_hit"
  | "duplicate_suppressed"
  | "rule_bypass"
  | "retry"

export interface MetricEvent {
  ts: string
  workflow_id: string
  stage: WorkflowStage
  event: MetricEventType
  agent?: string
  /**
   * Model identifier used for this call (e.g. "claude-sonnet-4.6").
   * Enables cost estimation via cost-estimator.ts.
   */
  model?: string
  /** Estimated input tokens (chars / 4) */
  est_input_tokens: number
  /** Estimated output tokens (chars / 4) */
  est_output_tokens: number
  /** Raw input character count */
  input_chars: number
  /** Raw output character count */
  output_chars: number
  duration_ms?: number
  /** Estimated USD cost for this event (populated when model is known). */
  est_cost_usd?: number
}

export interface StageSummary {
  stage: WorkflowStage
  model_calls: number
  cache_hits: number
  duplicates_suppressed: number
  rule_bypasses: number
  retries: number
  total_est_input_tokens: number
  total_est_output_tokens: number
  avg_input_chars: number
  avg_output_chars: number
  /** Estimated USD cost for this stage (requires model field on events). */
  est_cost_usd: number
}

export interface MetricsReport {
  workflow_id: string
  by_stage: StageSummary[]
  totals: {
    model_calls: number
    cache_hits: number
    duplicates_suppressed: number
    rule_bypasses: number
    retries: number
    est_input_tokens: number
    est_output_tokens: number
    /** Estimated total USD cost across all model calls. 0 if no model info available. */
    est_cost_usd: number
    /** Estimated USD wasted on retries. */
    retry_cost_usd: number
    cache_hit_rate: number
    duplicate_suppression_rate: number
    rule_bypass_rate: number
    retry_rate: number
  }
  efficiency: {
    most_expensive_stage: string
    cache_effectiveness: "good" | "moderate" | "low"
    avg_context_chars_by_stage: Record<string, number>
  }
  /** Workflow-level timing if startWorkflowTimer was called. */
  elapsed_ms?: number
}

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function metricsPath(dir: string): string {
  return join(codebaseDir(dir), "TOKEN_METRICS.jsonl")
}

function appendEvent(dir: string, event: MetricEvent): void {
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
  appendFileSync(metricsPath(dir), JSON.stringify(event) + "\n", "utf-8")
}

function loadEvents(dir: string, workflow_id: string): MetricEvent[] {
  const p = metricsPath(dir)
  if (!existsSync(p)) return []
  try {
    return readFileSync(p, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(l => JSON.parse(l) as MetricEvent)
      .filter(e => e.workflow_id === workflow_id)
  } catch {
    return []
  }
}

export function recordModelCall(
  dir: string,
  workflow_id: string,
  stage: WorkflowStage,
  inputText: string,
  outputText: string,
  agent?: string,
  duration_ms?: number,
  model?: string,
  est_cost_usd?: number,
): void {
  const est_input_tokens = estimateTokens(inputText)
  const est_output_tokens = estimateTokens(outputText)
  appendEvent(dir, {
    ts: new Date().toISOString(),
    workflow_id,
    stage,
    event: "model_call",
    agent,
    model,
    est_input_tokens,
    est_output_tokens,
    input_chars: inputText.length,
    output_chars: outputText.length,
    duration_ms,
    est_cost_usd,
  })
}

export function recordCacheHit(
  dir: string,
  workflow_id: string,
  stage: WorkflowStage,
  inputText: string,
  agent?: string,
  model?: string,
): void {
  appendEvent(dir, {
    ts: new Date().toISOString(),
    workflow_id,
    stage,
    event: "cache_hit",
    agent,
    model,
    est_input_tokens: estimateTokens(inputText),
    est_output_tokens: 0,
    input_chars: inputText.length,
    output_chars: 0,
  })
}

export function recordDuplicateSuppressed(
  dir: string,
  workflow_id: string,
  stage: WorkflowStage,
  agent?: string,
): void {
  appendEvent(dir, {
    ts: new Date().toISOString(),
    workflow_id,
    stage,
    event: "duplicate_suppressed",
    agent,
    est_input_tokens: 0,
    est_output_tokens: 0,
    input_chars: 0,
    output_chars: 0,
  })
}

/**
 * Record a retry model call.
 * This is a model call that happened because the previous attempt failed transiently.
 * Contributes to retry_cost_usd in the cost report.
 */
export function recordRetryCall(
  dir: string,
  workflow_id: string,
  stage: WorkflowStage,
  inputText: string,
  outputText: string,
  agent?: string,
  duration_ms?: number,
  model?: string,
  est_cost_usd?: number,
): void {
  const est_input_tokens = estimateTokens(inputText)
  const est_output_tokens = estimateTokens(outputText)
  appendEvent(dir, {
    ts: new Date().toISOString(),
    workflow_id,
    stage,
    event: "retry",
    agent,
    model,
    est_input_tokens,
    est_output_tokens,
    input_chars: inputText.length,
    output_chars: outputText.length,
    duration_ms,
    est_cost_usd,
  })
}

/**
 * Record a rule-based bypass — a check answered deterministically without a model call.
 * `check_type` identifies which rule-based check was used.
 */
export function recordRuleBypass(
  dir: string,
  workflow_id: string,
  stage: WorkflowStage,
  check_type: string,
  agent?: string,
): void {
  appendEvent(dir, {
    ts: new Date().toISOString(),
    workflow_id,
    stage,
    event: "rule_bypass",
    agent: agent ?? check_type,
    est_input_tokens: 0,
    est_output_tokens: 0,
    input_chars: 0,
    output_chars: 0,
  })
}

/** In-memory workflow start times for elapsed-time tracking. */
const _workflowTimers = new Map<string, number>()

/**
 * Mark the start of a workflow run for latency tracking.
 * Call this before the first model call for a workflow.
 */
export function startWorkflowTimer(workflow_id: string): void {
  _workflowTimers.set(workflow_id, Date.now())
}

/**
 * Get elapsed milliseconds since startWorkflowTimer was called.
 * Returns undefined if the timer was not started.
 */
export function getWorkflowElapsed(workflow_id: string): number | undefined {
  const start = _workflowTimers.get(workflow_id)
  return start !== undefined ? Date.now() - start : undefined
}

export function getMetricsReport(dir: string, workflow_id: string): MetricsReport {
  const events = loadEvents(dir, workflow_id)

  const byStage = new Map<WorkflowStage, StageSummary>()

  for (const e of events) {
    if (!byStage.has(e.stage)) {
      byStage.set(e.stage, {
        stage: e.stage,
        model_calls: 0,
        cache_hits: 0,
        duplicates_suppressed: 0,
        rule_bypasses: 0,
        retries: 0,
        total_est_input_tokens: 0,
        total_est_output_tokens: 0,
        avg_input_chars: 0,
        avg_output_chars: 0,
        est_cost_usd: 0,
      })
    }
    const s = byStage.get(e.stage)!
    if (e.event === "model_call") {
      s.model_calls++
      s.total_est_input_tokens += e.est_input_tokens
      s.total_est_output_tokens += e.est_output_tokens
      s.est_cost_usd += e.est_cost_usd ?? 0
    } else if (e.event === "cache_hit") {
      s.cache_hits++
    } else if (e.event === "duplicate_suppressed") {
      s.duplicates_suppressed++
    } else if (e.event === "rule_bypass") {
      s.rule_bypasses++
    } else if (e.event === "retry") {
      s.retries++
      s.total_est_input_tokens += e.est_input_tokens
      s.total_est_output_tokens += e.est_output_tokens
      s.est_cost_usd += e.est_cost_usd ?? 0
    }
  }

  // Compute average context sizes
  const modelCallEvents = events.filter(e => e.event === "model_call")
  const stageCharTotals = new Map<WorkflowStage, { input: number; output: number; count: number }>()
  for (const e of modelCallEvents) {
    if (!stageCharTotals.has(e.stage)) stageCharTotals.set(e.stage, { input: 0, output: 0, count: 0 })
    const s = stageCharTotals.get(e.stage)!
    s.input += e.input_chars
    s.output += e.output_chars
    s.count++
  }
  for (const [stage, totals] of stageCharTotals) {
    const summary = byStage.get(stage)
    if (summary && totals.count > 0) {
      summary.avg_input_chars = Math.round(totals.input / totals.count)
      summary.avg_output_chars = Math.round(totals.output / totals.count)
    }
  }

  const stages = Array.from(byStage.values())
    .sort((a, b) => b.total_est_input_tokens - a.total_est_input_tokens)

  const totalModelCalls = stages.reduce((s, x) => s + x.model_calls, 0)
  const totalCacheHits = stages.reduce((s, x) => s + x.cache_hits, 0)
  const totalDuplicates = stages.reduce((s, x) => s + x.duplicates_suppressed, 0)
  const totalRuleBypasses = stages.reduce((s, x) => s + x.rule_bypasses, 0)
  const totalRetries = stages.reduce((s, x) => s + x.retries, 0)
  const totalRequests = totalModelCalls + totalCacheHits + totalDuplicates + totalRuleBypasses + totalRetries

  const cacheHitRate = totalRequests > 0 ? totalCacheHits / totalRequests : 0
  const suppressionRate = totalRequests > 0 ? totalDuplicates / totalRequests : 0
  const ruleBypassRate = totalRequests > 0 ? totalRuleBypasses / totalRequests : 0
  const retryRate = totalModelCalls > 0 ? totalRetries / totalModelCalls : 0

  // Aggregate cost across stages
  const totalEstCostUsd = stages.reduce((s, x) => s + x.est_cost_usd, 0)
  const retryCostUsd = events
    .filter(e => e.event === "retry")
    .reduce((s, e) => s + (e.est_cost_usd ?? 0), 0)

  const mostExpensive = stages.slice().sort((a, b) => b.est_cost_usd - a.est_cost_usd)[0]?.stage
    ?? stages[0]?.stage
    ?? "none"
  const cacheEffectiveness: "good" | "moderate" | "low" =
    cacheHitRate > 0.5 ? "good" : cacheHitRate > 0.2 ? "moderate" : "low"

  const avgContextCharsByStage: Record<string, number> = {}
  for (const s of stages) {
    if (s.model_calls > 0) {
      avgContextCharsByStage[s.stage] = s.avg_input_chars
    }
  }

  return {
    workflow_id,
    by_stage: stages,
    totals: {
      model_calls: totalModelCalls,
      cache_hits: totalCacheHits,
      duplicates_suppressed: totalDuplicates,
      rule_bypasses: totalRuleBypasses,
      retries: totalRetries,
      est_input_tokens: stages.reduce((s, x) => s + x.total_est_input_tokens, 0),
      est_output_tokens: stages.reduce((s, x) => s + x.total_est_output_tokens, 0),
      est_cost_usd: Math.round(totalEstCostUsd * 1_000_000) / 1_000_000,
      retry_cost_usd: Math.round(retryCostUsd * 1_000_000) / 1_000_000,
      cache_hit_rate: Math.round(cacheHitRate * 100) / 100,
      duplicate_suppression_rate: Math.round(suppressionRate * 100) / 100,
      rule_bypass_rate: Math.round(ruleBypassRate * 100) / 100,
      retry_rate: Math.round(retryRate * 100) / 100,
    },
    efficiency: {
      most_expensive_stage: mostExpensive,
      cache_effectiveness: cacheEffectiveness,
      avg_context_chars_by_stage: avgContextCharsByStage,
    },
    elapsed_ms: getWorkflowElapsed(workflow_id),
  }
}

/** List all workflow IDs that have metric events. */
export function listTrackedWorkflows(dir: string): string[] {
  const p = metricsPath(dir)
  if (!existsSync(p)) return []
  try {
    const ids = new Set<string>()
    for (const line of readFileSync(p, "utf-8").trim().split("\n").filter(Boolean)) {
      try {
        const e = JSON.parse(line) as MetricEvent
        ids.add(e.workflow_id)
      } catch { /* ignore malformed */ }
    }
    return Array.from(ids)
  } catch {
    return []
  }
}
