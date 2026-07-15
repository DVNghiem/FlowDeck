/**
 * Keyword-driven intent classifier for the user's opening message.
 *
 * Maps tokenized message text to one of the closed `IntentClass` values.
 * Confidence scales with the number of keyword hits in the matched group;
 * ties broken by group priority (bugfix > resume > status > feature > unknown).
 *
 * Cross-reference with .fd-plan/ pending tasks happens via the sibling
 * `detectPendingTasks` hook at session start.
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
 * Group → IntentClass mapping. `IntentClass` is a closed union, so groups
 * that don't fit (feature/status/resume) collapse to the nearest valid
 * class: feature-with-UI → "ui-heavy", feature-no-UI → "unknown",
 * status-check → "trivial", resume → "explore".
 */
const BUGFIX_KEYWORDS = ["fix", "bug", "error", "broken", "crash", "fails", "failing"]
const RESUME_KEYWORDS = ["resume", "continue"]
const STATUS_KEYWORDS = ["status", "pending", "show tasks", "list tasks", "what's pending"]
const FEATURE_KEYWORDS = ["add", "implement", "build", "create", "introduce"]
const UI_KEYWORDS = ["ui", "page", "component", "frontend", "screen", "view"]

/** Count keyword hits; word-boundary match so "fixing" still counts. */
function countHits(message: string, keywords: string[]): number {
  const lower = message.toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`\\b${escaped}\\b`, "g")
    const matches = lower.match(re)
    if (matches) hits += matches.length
  }
  return hits
}

function scoreFor(intent: IntentClass): RoutingScores {
  // Neutral 0.5 baseline; bump the routed dimension.
  const base = {
    explore: 0.5,
    research: 0.5,
    architect: 0.5,
    plan: 0.5,
    execute: 0.5,
    qa: 0.5,
    ship: 0.5,
  }
  switch (intent) {
    case "bugfix":
      return { ...base, explore: 0.7, execute: 0.7, qa: 0.6 }
    case "ui-heavy":
      return { ...base, explore: 0.6, plan: 0.7, execute: 0.7 }
    case "docs-only":
      return { ...base, research: 0.7 }
    case "trivial":
      return { ...base, explore: 0.6 }
    case "explore":
      return { ...base, explore: 0.8, research: 0.6 }
    case "unknown":
    default:
      return base
  }
}

/**
 * Analyze the user's message to classify intent.
 *
 * Returns `{ intent, scores, confidence }`. `confidence` is the hit count
 * for the matched group, clamped to [0, 1]. When multiple groups match,
 * priority is bugfix > resume > status > feature; remaining tie-breaks
 * go to whichever group had more hits.
 *
 * @param message  The user's opening message
 * @param _directory  Project root for .fd-plan/ lookup (reserved for future
 *                    cross-referencing with `detectPendingTasks`)
 */
export async function detectIntent(
  message: string,
  _directory: string
): Promise<IntentDetectionResult> {
  const bugfixHits = countHits(message, BUGFIX_KEYWORDS)
  const resumeHits = countHits(message, RESUME_KEYWORDS)
  const statusHits = countHits(message, STATUS_KEYWORDS)
  const featureHits = countHits(message, FEATURE_KEYWORDS)
  const uiHits = countHits(message, UI_KEYWORDS)

  let intent: IntentClass = "unknown"
  let rawHits = 0

  if (bugfixHits > 0) {
    intent = "bugfix"
    rawHits = bugfixHits
  } else if (resumeHits > 0) {
    intent = "explore"
    rawHits = resumeHits
  } else if (statusHits > 0) {
    intent = "trivial"
    rawHits = statusHits
  } else if (featureHits > 0) {
    intent = uiHits > 0 ? "ui-heavy" : "unknown"
    rawHits = featureHits
  }

  const confidence = Math.min(1, rawHits * 0.4)

  return {
    intent,
    scores: scoreFor(intent),
    confidence,
  }
}
