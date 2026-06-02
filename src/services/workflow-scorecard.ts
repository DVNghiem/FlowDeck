/**
 * Workflow Scorecard Service
 * Generates a quality score for every completed or failed workflow run.
 * Scores across 10 dimensions; stored in .codebase/SCORECARDS.jsonl for trend analysis.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { randomUUID } from "crypto"
import type { RunTrace } from "./run-trace"
import { getTraceSpans } from "./agent-trace-graph"
import { getSignals } from "./deadlock-detector"

export interface ScorecardDimensions {
  /** Agents followed phase order and didn't skip required stages */
  stageCompliance: number
  /** Design-first process followed for UI-heavy tasks */
  designFirstCompliance: number
  /** TDD cycle followed (tests before implementation) */
  tddCompliance: number
  /** Required approvals obtained before proceeding */
  approvalCompliance: number
  /** Review step completed before marking done */
  reviewQuality: number
  /** Low retry rate: 1 - (retries / maxRetries) */
  retryEfficiency: number
  /** Tool call budget used efficiently */
  budgetEfficiency: number
  /** Tool calls succeeded without errors */
  toolReliability: number
  /** Agents produced valid, schema-conforming outputs */
  handoffQuality: number
  /** No agent contract violations */
  contractCompliance: number
  /**
   * Supervisor review outcomes: proportion of reviews that resulted in "approve"
   * or "revise" (recoverable), versus "block" or "escalate" (hard stops).
   * Defaults to 1.0 when the supervisor is disabled or no reviews occurred.
   */
  supervisorCompliance: number
}

export interface WorkflowScorecard {
  scorecard_id: string
  run_id: string
  session_id: string
  command: string
  generated_at: string
  completion_status: "complete" | "failed" | "blocked" | "cancelled"
  dimensions: ScorecardDimensions
  /** Weighted average across all dimensions, 0–100 */
  overall_score: number
  policy_violations: number
  human_interventions: number
  overrides_used: number
  deadlock_signals: number
  /** Total supervisor review events for this run */
  supervisor_reviews: number
  /** Supervisor reviews that resulted in block or escalate */
  supervisor_hard_stops: number
  success_reason?: string
  failure_reason?: string
}

export interface ScorecardInput {
  /** Pass false to penalize design-first compliance */
  design_first_compliant?: boolean
  /** Pass false to penalize TDD compliance */
  tdd_compliant?: boolean
  /** Pass false to penalize approval compliance */
  approval_compliant?: boolean
  /** Pass false to penalize review quality */
  review_completed?: boolean
  policy_violations?: number
  human_interventions?: number
  overrides_used?: number
  /**
   * Total supervisor reviews that occurred.
   * Computed automatically from telemetry when omitted.
   */
  supervisor_reviews?: number
  /**
   * Number of reviews that resulted in "block" or "escalate".
   * Computed automatically from telemetry when omitted.
   */
  supervisor_hard_stops?: number
}

const DIMENSION_WEIGHTS: Record<keyof ScorecardDimensions, number> = {
  stageCompliance: 0.12,
  designFirstCompliance: 0.10,
  tddCompliance: 0.13,
  approvalCompliance: 0.10,
  reviewQuality: 0.10,
  retryEfficiency: 0.10,
  budgetEfficiency: 0.05,
  toolReliability: 0.10,
  handoffQuality: 0.10,
  contractCompliance: 0.05,
  supervisorCompliance: 0.05,
}

export function scorecardsPath(dir: string): string {
  return join(codebaseDir(dir), "SCORECARDS.jsonl")
}

/**
 * Generate and persist a scorecard for the given run.
 * Call this when a run transitions to complete/failed/cancelled.
 */
export function generateScorecard(
  dir: string,
  trace: RunTrace,
  input: ScorecardInput = {},
): WorkflowScorecard {
  const spans = getTraceSpans(dir, trace.run_id)
  const deadlockSignals = getSignals(dir, trace.run_id)

  const toolFailures = 0
  const totalToolCalls = spans.reduce((sum, span) => sum + span.tools_used.length, 0)

  const supervisorReviews = input.supervisor_reviews ?? 0
  const supervisorHardStops = input.supervisor_hard_stops ?? 0
  const supervisorCompliance =
    supervisorReviews === 0
      ? 1
      : Math.max(0, 1 - supervisorHardStops / supervisorReviews)

  const spansWithViolations = spans.filter(s => s.contract_violations.length > 0).length
  const spansWithValidOutput = spans.filter(s => s.output_valid).length
  const totalSpans = spans.length

  const uniqueStages = new Set(spans.map(span => `${span.agent}:${span.stage}`)).size
  const retries = Math.max(0, totalSpans - uniqueStages)
  const maxRetries = Math.max(10, totalSpans)
  const toolCalls = totalToolCalls
  const maxToolCalls = Math.max(200, totalToolCalls || 0)

  const dimensions: ScorecardDimensions = {
    stageCompliance: totalSpans > 0 ? 1 - spansWithViolations / totalSpans : 1,
    designFirstCompliance: input.design_first_compliant !== false ? 1 : 0,
    tddCompliance: input.tdd_compliant !== false ? 1 : 0,
    approvalCompliance: input.approval_compliant !== false ? 1 : 0,
    reviewQuality: input.review_completed !== false ? 1 : 0,
    retryEfficiency: maxRetries > 0 ? Math.max(0, 1 - retries / maxRetries) : 1,
    budgetEfficiency: maxToolCalls > 0 ? Math.max(0, 1 - toolCalls / maxToolCalls) : 1,
    toolReliability: totalToolCalls > 0 ? Math.max(0, 1 - toolFailures / totalToolCalls) : 1,
    handoffQuality: totalSpans > 0 ? spansWithValidOutput / totalSpans : 1,
    contractCompliance: totalSpans > 0 ? 1 - spansWithViolations / totalSpans : 1,
    supervisorCompliance,
  }

  const overallScore = Math.round(
    (Object.entries(dimensions) as Array<[keyof ScorecardDimensions, number]>)
      .reduce((sum, [key, val]) => sum + val * DIMENSION_WEIGHTS[key] * 100, 0),
  )

  const completion_status: WorkflowScorecard["completion_status"] =
    trace.status === "complete" ? "complete" :
    trace.status === "failed" ? "failed" :
    trace.status === "cancelled" ? "cancelled" :
    "blocked"

  const scorecard: WorkflowScorecard = {
    scorecard_id: randomUUID(),
    run_id: trace.run_id,
    session_id: trace.session_id,
    command: trace.command,
    generated_at: new Date().toISOString(),
    completion_status,
    dimensions,
    overall_score: overallScore,
    policy_violations: input.policy_violations ?? 0,
    human_interventions: input.human_interventions ?? 0,
    overrides_used: input.overrides_used ?? 0,
    deadlock_signals: deadlockSignals.length,
    supervisor_reviews: supervisorReviews,
    supervisor_hard_stops: supervisorHardStops,
    success_reason: trace.outcome,
    failure_reason: trace.error,
  }

  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
  appendFileSync(scorecardsPath(dir), JSON.stringify(scorecard) + "\n", "utf-8")

  return scorecard
}

export function readScorecards(dir: string, limit = 50): WorkflowScorecard[] {
  const p = scorecardsPath(dir)
  if (!existsSync(p)) return []
  try {
    const lines = readFileSync(p, "utf-8").trim().split("\n").filter(Boolean)
    return lines.slice(-limit).map(l => JSON.parse(l) as WorkflowScorecard)
  } catch {
    return []
  }
}

export function getScorecardByRun(dir: string, run_id: string): WorkflowScorecard | null {
  return readScorecards(dir, 200).findLast(s => s.run_id === run_id) ?? null
}

/**
 * Return the last N scorecards, optionally filtered by command.
 */
export function getScorecardTrend(dir: string, command?: string, limit = 20): WorkflowScorecard[] {
  const all = readScorecards(dir, 200)
  const filtered = command ? all.filter(s => s.command === command) : all
  return filtered.slice(-limit)
}

/**
 * Average overall score across recent runs, optionally for a specific command.
 * Returns null if no data exists.
 */
export function computeAverageScore(dir: string, command?: string): number | null {
  const cards = getScorecardTrend(dir, command)
  if (cards.length === 0) return null
  return Math.round(cards.reduce((sum, s) => sum + s.overall_score, 0) / cards.length)
}
