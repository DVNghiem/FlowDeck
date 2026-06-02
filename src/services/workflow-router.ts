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

export interface WorkflowRoute {
  workflowClass: WorkflowClass
  stages: WorkflowStage[]
  criteria: RoutingCriteria
  scores: RoutingScore
  reason: string
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
