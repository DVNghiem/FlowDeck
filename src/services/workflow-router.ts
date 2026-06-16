/**
 * Workflow Router Service
 *
 * Adaptive workflow routing that replaces the fixed pipeline in quick-router.ts.
 * Scores tasks across multiple dimensions and selects the most appropriate
 * workflow class and stage sequence.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs"
import { join, resolve } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import type { TaskType, WorkflowStage } from "./quick-router"

function isSafePath(dir: string): boolean {
  const resolved = resolve(dir)
  return !resolved.includes("..")
}

export type WorkflowClass =
  | "quick"
  | "standard"
  | "explore"
  | "ui-heavy"
  | "bugfix"
  | "docs-only"
  | "verify-heavy"

export interface RoutingCriteria {
  taskType: TaskType
  complexity: "cheap" | "standard" | "expensive"
  confidence: number
  blastRadius: number
  isSensitive: boolean
  codebaseFreshness: "fresh" | "stale" | "unknown"
  requiresTests: boolean
}

export interface RoutingScore {
  simplicity: number
  confidence: number
  lowRisk: number
  knownCodebase: number
  cheapComplexity: number
  total: number
}

/**
 * Heuristic classification fields used by upstream callers (orchestrator,
 * context-ingress, tool-selection-policy) to decide whether to discuss
 * before acting, whether code-graph context is needed, and to log why the
 * router chose a particular workflow class.
 */
export interface RoutingHeuristics {
  /** True when the task should run through a pre-execution discuss/clarify stage. */
  requiresDiscuss: boolean
  /** When requiresDiscuss is false, the explicit reason discuss was skipped. */
  skipDiscussReason?: string
  /** True when the task likely needs structural code understanding (code graph, AST). */
  needsCodeUnderstanding: boolean
  /** Free-form classifier signals: e.g. ["simple", "high_confidence", "low_risk"]. */
  classificationSignals: string[]
}

export interface WorkflowRoute {
  workflowClass: WorkflowClass
  stages: WorkflowStage[]
  criteria: RoutingCriteria
  scores: RoutingScore
  reason: string
  /** Heuristic fields describing whether to discuss first, code understanding, etc. */
  heuristics: RoutingHeuristics
}

export interface EscalationEvent {
  from: WorkflowClass
  to: WorkflowClass
  trigger: string
  reason: string
  timestamp: string
}

export interface RoutingDecision {
  route: WorkflowRoute
  escalationHistory: EscalationEvent[]
  skippedStages: string[]
  loggedAt: string
}

function stage(
  name: string,
  command: string,
  requiresApproval: boolean,
  skippable: boolean,
  args?: string,
): WorkflowStage {
  return { name, command, args, requiresApproval, skippable }
}

export function scoreTaskForRouting(criteria: RoutingCriteria): RoutingScore {
  const simplicity = (criteria.taskType === "simple" ? 1 : 0) * 0.30
  const confidence = criteria.confidence * 0.20
  const lowRisk = (!criteria.isSensitive && criteria.blastRadius < 3) ? 0.20 : 0
  const knownCodebase = criteria.codebaseFreshness === "fresh" ? 0.15 : 0
  const cheapComplexity = criteria.complexity === "cheap" ? 0.15 : 0
  const total = simplicity + confidence + lowRisk + knownCodebase + cheapComplexity

  return {
    simplicity,
    confidence,
    lowRisk,
    knownCodebase,
    cheapComplexity,
    total,
  }
}

/**
 * Compute classification heuristics from routing criteria.
 *
 * Skip-discuss policy: only strong simple evidence is allowed to skip the
 * pre-execution discuss stage. The check is intentionally conservative — any
 * non-trivial signal (low confidence, sensitive paths, large blast radius,
 * expensive complexity, ambiguous task type, UI work) forces discuss.
 */
export function computeRoutingHeuristics(criteria: RoutingCriteria): RoutingHeuristics {
  const signals: string[] = []
  let requiresDiscuss = false

  // Always-discuss triggers (additive — any one of these forces discuss)
  if (criteria.taskType === "ambiguous") {
    requiresDiscuss = true
    signals.push("ambiguous_task_type")
  }
  if (criteria.confidence < 0.60) {
    requiresDiscuss = true
    signals.push("low_confidence")
  }
  if (criteria.isSensitive) {
    requiresDiscuss = true
    signals.push("sensitive_path")
  }
  if (criteria.blastRadius >= 5) {
    requiresDiscuss = true
    signals.push("high_blast_radius")
  }
  if (criteria.complexity === "expensive") {
    requiresDiscuss = true
    signals.push("expensive_complexity")
  }
  if (criteria.taskType === "ui-feature" || criteria.taskType === "bugfix") {
    requiresDiscuss = true
    signals.push("requires_specialization")
  }

  // Skip-discuss ONLY requires ALL of the following strong simple signals.
  // We never skip discuss for ambiguous, low-confidence, sensitive, or
  // expensive tasks even if other signals are present.
  const isStrongSimple =
    criteria.taskType === "simple" &&
    criteria.confidence >= 0.85 &&
    criteria.blastRadius < 3 &&
    !criteria.isSensitive &&
    criteria.complexity !== "expensive"

  const isDocsQuick =
    criteria.taskType === "docs" &&
    criteria.confidence >= 0.80 &&
    criteria.blastRadius < 3 &&
    !criteria.isSensitive

  let skipDiscussReason: string | undefined
  if (!requiresDiscuss && (isStrongSimple || isDocsQuick)) {
    if (isStrongSimple) {
      signals.push("simple_task", "high_confidence", "low_blast_radius", "cheap_or_standard_complexity")
    }
    if (isDocsQuick) {
      signals.push("docs_task", "high_confidence", "low_blast_radius")
    }
    skipDiscussReason = isStrongSimple
      ? "strong_simple: taskType=simple, confidence>=0.85, blastRadius<3, not sensitive, not expensive"
      : "docs_quick: taskType=docs, confidence>=0.80, blastRadius<3, not sensitive"
  } else if (!requiresDiscuss) {
    // No skip trigger and no force trigger — default conservative position is
    // to keep discuss available unless caller asked for skip.
    requiresDiscuss = true
    signals.push("default_conservative")
  }

  // Code understanding: needed when the task touches code or when the codebase
  // mapping is unknown/stale (we'd otherwise have to fall back to a full read).
  const codeTouchingTypes: TaskType[] = ["feature", "ui-feature", "bugfix", "simple"]
  const needsCodeUnderstanding =
    codeTouchingTypes.includes(criteria.taskType) ||
    criteria.codebaseFreshness !== "fresh" ||
    criteria.blastRadius >= 1

  return {
    requiresDiscuss,
    skipDiscussReason,
    needsCodeUnderstanding,
    classificationSignals: [...new Set(signals)],
  }
}

export function buildAdaptiveStageSequence(criteria: RoutingCriteria): WorkflowRoute {
  const scores = scoreTaskForRouting(criteria)
  const totalScore = scores.total

  let workflowClass: WorkflowClass
  let stages: WorkflowStage[]
  let reason: string

  if (totalScore >= 0.75 && (criteria.taskType === "simple" || criteria.taskType === "docs")) {
    workflowClass = "quick"
    stages = [
      stage("execute", "fd-execute", false, true),
      stage("verify", "fd-verify", false, true),
    ]
    reason = `Quick workflow: score ${totalScore.toFixed(2)} >= 0.75 for ${criteria.taskType} task`
  } else if (criteria.taskType === "bugfix") {
    workflowClass = "bugfix"
    stages = [
      stage("discuss", "fd-discuss", false, false),
      stage("fix-bug", "fd-fix-bug", false, false),
      stage("verify", "fd-verify", false, false),
    ]
    reason = "Bugfix workflow: task type is bugfix"
  } else if (criteria.taskType === "docs" && totalScore < 0.75) {
    workflowClass = "docs-only"
    stages = [
      stage("write-docs", "fd-write-docs", false, false),
      stage("verify", "fd-verify", false, true),
    ]
    reason = `Docs-only workflow: score ${totalScore.toFixed(2)} < 0.75 for docs task`
  } else if (criteria.taskType === "ui-feature") {
    workflowClass = "ui-heavy"
    stages = [
      stage("discuss", "fd-discuss", false, false),
      stage("design", "fd-design", false, false, "--mode=draft"),
      stage("plan", "fd-plan", true, false),
      stage("execute", "fd-execute", false, false),
      stage("verify", "fd-verify", false, false),
    ]
    reason = "UI-heavy workflow: task type indicates UI-heavy work"
  } else if (criteria.blastRadius >= 5 || criteria.isSensitive) {
    workflowClass = "verify-heavy"
    stages = [
      stage("plan", "fd-plan", true, false),
      stage("execute", "fd-execute", false, false),
      stage("verify", "fd-verify", false, false),
    ]
    reason = `Verify-heavy workflow: blastRadius=${criteria.blastRadius}, isSensitive=${criteria.isSensitive}`
  } else if (criteria.confidence < 0.60 || criteria.taskType === "ambiguous") {
    workflowClass = "explore"
    stages = [
      stage("discuss", "fd-discuss", false, false),
      stage("plan", "fd-plan", true, false),
      stage("execute", "fd-execute", false, false),
      stage("verify", "fd-verify", false, false),
    ]
    reason = `Explore workflow: confidence=${criteria.confidence}, taskType=${criteria.taskType}`
  } else {
    workflowClass = "standard"
    stages = [
      stage("plan", "fd-plan", true, false),
      stage("execute", "fd-execute", false, false),
      stage("verify", "fd-verify", false, false),
    ]
    reason = `Standard workflow: score ${totalScore.toFixed(2)} with taskType ${criteria.taskType}`
  }

  return {
    workflowClass,
    stages,
    criteria,
    scores,
    reason,
    heuristics: computeRoutingHeuristics(criteria),
  }
}

export function shouldEscalate(
  currentClass: WorkflowClass,
  evidence: {
    blastRadius?: number
    isSensitive?: boolean
    testsFailing?: boolean
    designNeeded?: boolean
  },
): WorkflowClass | null {
  if (currentClass === "quick") {
    if (evidence.blastRadius !== undefined && evidence.blastRadius > 3) {
      return "standard"
    }
    if (evidence.testsFailing) {
      return "standard"
    }
  }

  if (currentClass === "standard") {
    if (evidence.isSensitive) {
      return "verify-heavy"
    }
    if (evidence.blastRadius !== undefined && evidence.blastRadius >= 5) {
      return "verify-heavy"
    }
    if (evidence.designNeeded) {
      return "ui-heavy"
    }
  }

  return null
}

export function logRoutingDecision(dir: string, decision: RoutingDecision): void {
  if (!isSafePath(dir)) return
  try {
    const cd = codebaseDir(dir)
    if (!existsSync(cd)) {
      mkdirSync(cd, { recursive: true })
    }
    const logPath = join(cd, "WORKFLOW_ROUTING.jsonl")
    appendFileSync(logPath, JSON.stringify(decision) + "\n", "utf-8")
  } catch {
    // Silently fail — routing decision logging is best-effort
  }
}

export function getHistoricalCompliance(dir: string, taskType: TaskType): number | null {
  if (!isSafePath(dir)) return null
  try {
    const path = join(codebaseDir(dir), "SCORECARDS.jsonl")
    if (!existsSync(path)) {
      return null
    }

    const lines = readFileSync(path, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)

    if (lines.length === 0) {
      return null
    }

    let total = 0
    let count = 0

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as {
          dimensions?: { stageCompliance?: number }
          taskType?: string
        }

        if (entry.taskType !== undefined && entry.taskType !== taskType) {
          continue
        }

        const compliance = entry.dimensions?.stageCompliance
        if (typeof compliance === "number") {
          total += compliance
          count++
        }
      } catch {
        continue
      }
    }

    return count > 0 ? total / count : null
  } catch {
    return null
  }
}
