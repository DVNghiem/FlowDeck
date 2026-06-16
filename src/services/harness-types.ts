/**
 * Shared harness types used across the FlowDeck runtime services.
 *
 * This module contains only type definitions and re-exports. It is imported
 * by services, tools, and the plugin entry point to keep cross-layer contracts
 * explicit and avoid circular dependencies.
 */

import type { ToolEvent } from "./event-logger"
import type { WorkflowStage } from "./quick-router"

export type { ToolEvent }
export type { WorkflowStage }

export interface TokenBudgetSnapshot {
  /** Tokens already consumed by the assembled context (cheap proxy). */
  usedTokens: number
  /** Total token envelope available for this run. */
  totalTokens: number
  /** Remaining tokens in the envelope. */
  remainingTokens: number
  /** Percentage of the envelope already used (0-100). */
  percentUsed: number
}

/**
 * Stage-bounded loading plan. The context-ingress service uses this to
 * decide what context to assemble BEFORE loading the heavy artifacts. It
 * also exposes the plan to the tool-selection-policy and to logs.
 */
export interface ContextLoadPlan {
  /** Whether heavy docs need to be loaded at all. */
  loadCodebaseDocs: boolean
  /** Whether the recent-events log should be scanned. */
  loadRecentEvents: boolean
  /** Cap on the number of docs to include. */
  maxDocs: number
  /** Cap on the number of rules to include. */
  maxRules: number
  /** Cap on the number of skills to include. */
  maxSkills: number
  /** Cap on the number of events to include. */
  maxEvents: number
  /** Whether the plan content should be loaded. */
  loadPlan: boolean
  /** Reasons the plan took this shape (logged in the diagnostics). */
  reasons: string[]
}

/** Readiness signals gathered BEFORE heavy context loading. */
export interface ContextReadiness {
  /** Whether STATE.md exists and was parseable. */
  statePresent: boolean
  /** Whether the planning state is marked fresh. */
  stateFresh: boolean
  /** Whether the .codebase/ directory has at least one doc. */
  codebaseIndexPresent: boolean
  /** Whether codegraph is installed. */
  codegraphInstalled: boolean
  /** Whether the codegraph index exists on disk. */
  codegraphIndexed: boolean
  /** Whether the codegraph index is fresh (recent + matched revision). */
  codegraphFresh: boolean
  /** Reasons readiness was non-ideal (logged + returned for diagnostics). */
  fallbacks: string[]
}

/** Per-stage diagnostic record. */
export interface ContextLoadDiagnostics {
  loadedDocs: string[]
  skippedDocs: string[]
  loadedEvents: number
  droppedEvents: number
  loadedRules: string[]
  loadedSkills: string[]
  budgetBefore: TokenBudgetSnapshot
  budgetAfter: TokenBudgetSnapshot
  fallbackReasons: string[]
}

export interface Observation {
  id: string
  runId: string
  type: string
  content: string
  timestamp: string
  source: string
}

export interface WorkflowRoute {
  workflowClass: string
  stages: WorkflowStage[]
  criteria: Record<string, unknown>
  scores: Record<string, number>
  reason: string
  /** When the route came from a richer classification, the heuristic fields. */
  requiresDiscuss?: boolean
  skipDiscussReason?: string
  needsCodeUnderstanding?: boolean
  classificationSignals?: string[]
}

export interface AssembledContext {
  runId: string
  sessionId: string
  projectRoot: string
  state: Record<string, unknown>
  route: WorkflowRoute
  relevantRules: string[]
  relevantSkills: string[]
  recentEvents: ToolEvent[]
  observations: Observation[]
  tokenBudget: TokenBudgetSnapshot
  isTrivialChat: boolean
  /** Readiness signals gathered before loading heavy context. */
  readiness: ContextReadiness
  /** The bounded load plan that produced this context. */
  loadPlan: ContextLoadPlan
  /** Per-stage diagnostic record (counts, names, fallback reasons). */
  diagnostics: ContextLoadDiagnostics
  /** Selected tool family (preferred MCP, fallbacks, reasons). */
  selectedToolFamily: {
    family: string
    mcp: string | null
    reason: string
    preferred: boolean
    fallbacks: string[]
  } | null
  /** True when token-optimizer was activated for this run. */
  tokenOptimizationActive: boolean
}

export interface RunState {
  runId: string
  workflowClass: string
  completedStages: string[]
  currentStage: string | null
  blocked: boolean
  blockedReason: string | null
  observations: Observation[]
}
