/**
 * FlowDeck v1 agent types.
 * Phase 1 Foundation — agent wiring is Phase 2+.
 *
 * AgentDefinition and AgentFactory are defined here.
 * AgentConfig is imported from src/agents/base.ts because it extends the SDK type
 * with `system` (fdx-first tool guidance) — that extension lives in base.ts.
 */

import type { AgentConfig } from "../agents/base"
import type { IntentClass, RoutingScores } from "./state"

// ── Agent definition ────────────────────────────────────────────────────────

/**
 * Agent configuration loaded from `src/agents/config.ts`.
 */
export interface AgentDefinition {
  /** Unique agent identifier used in routing decisions. */
  name: string
  /** Short description shown in agent listings. */
  description: string
  /** Model and runtime configuration. */
  config: AgentConfig
}

/** Factory type for agent constructor functions. */
export type AgentFactory = (model?: string) => AgentDefinition

// ── Orchestrator routing ────────────────────────────────────────────────────

/**
 * Hints passed to the orchestrator to guide agent selection.
 * Produced by classifyDispatch() in session-start.ts.
 */
export interface AgentRoutingHint {
  /** Classified intent of the current user message. */
  intent: IntentClass
  /** Confidence scores per workflow stage. */
  scores: RoutingScores
  /** Stage the orchestrator should route to next. */
  recommendedStage: keyof RoutingScores
  /** Reason string shown in debug output. */
  reason: string
  /** Whether the session has an active task. */
  hasActiveTask: boolean
}
