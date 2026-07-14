/**
 * Intent Detection — Phase 5 stub.
 *
 * NOT IMPLEMENTED IN PHASE 1.
 *
 * Phase 5 will analyze the user's opening message to:
 * - Detect whether a task is already in progress
 * - Identify the task type (feature, bugfix, refactor, docs, etc.)
 * - Classify urgency and complexity
 * - Auto-route to the appropriate workflow stage
 *
 * This runs at session start before the orchestrator takes control.
 *
 * TODO (Phase 5): Implement intent detection.
 *   - Analyze session message for task indicators
 *   - Cross-reference with .fd-plan/ pending tasks
 *   - Return IntentClass + RoutingScores for orchestrator routing
 *
 * @see PHASE1_CLEANUP_REPORT.md §Phase-5-Deferrals
 */

import type { IntentClass, RoutingScores } from "../types/state"

export interface IntentDetectionResult {
  intent: IntentClass
  scores: RoutingScores
  confidence: number
  detectedTask?: {
    slug: string
    topic: string
    status: string
  }
}

/**
 * Analyze the user's message to classify intent.
 *
 * Phase 5 implementation will use:
 * - Keyword extraction (bug, fix, add, remove, refactor, docs…)
 * - Pattern matching for common task templates
 * - Cross-reference with existing .fd-plan/ tasks
 *
 * @param message  The user's opening message
 * @param directory  Project root for .fd-plan/ lookup
 */
export async function detectIntent(
  message: string,
  directory: string
): Promise<IntentDetectionResult> {
  // Phase 5: implement full intent detection
  // For now, return unknown — orchestrator will use default routing
  return {
    intent: "unknown",
    scores: {
      explore: 0.5,
      research: 0.5,
      architect: 0.5,
      plan: 0.5,
      execute: 0.5,
      qa: 0.5,
      ship: 0.5,
    },
    confidence: 0,
  }
}
