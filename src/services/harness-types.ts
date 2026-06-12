/**
 * Shared harness types used across the FlowDeck runtime services.
 *
 * This module contains only type definitions and re-exports. It is imported
 * by services, tools, and the plugin entry point to keep cross-layer contracts
 * explicit and avoid circular dependencies.
 */

import type { ToolEvent } from "./event-logger"

export type { ToolEvent }

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
  stages: string[]
  criteria: Record<string, unknown>
  scores: Record<string, number>
  reason: string
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
