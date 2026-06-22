import { buildAdaptiveWorkflow, classifyTask } from "./quick-router"
import { classifyTaskComplexity } from "./model-router"
import { appendAuditEvent } from "./audit-log"

export type DispatchState = "executable" | "blocked" | "error"

export interface DispatchResult {
  state: DispatchState
  workflowClass: string
  primaryAgent: string
  reason: string
  signals: string[]
  requiresDiscuss: boolean
  needsCodeUnderstanding: boolean
  complexity: "cheap" | "standard" | "expensive"
}

const MAX_TASK_DESCRIPTION_LENGTH = 10_000

const PRIMARY_AGENT_BY_WORKFLOW: Record<string, string> = {
  quick: "default-executor",
  "docs-only": "writer",
  standard: "planner",
  explore: "discusser",
  bugfix: "debug-specialist",
  "ui-heavy": "design",
  "verify-heavy": "planner",
}

const PRIMARY_AGENT_BY_TASK_TYPE: Record<string, string> = {
  feature: "planner",
  "ui-feature": "design",
  bugfix: "debug-specialist",
  docs: "writer",
  simple: "default-executor",
  ambiguous: "discusser",
}

function blockedResult(reason: string, signals: string[]): DispatchResult {
  return {
    state: "blocked",
    workflowClass: "blocked",
    primaryAgent: "orchestrator",
    reason,
    signals,
    requiresDiscuss: false,
    needsCodeUnderstanding: false,
    complexity: "standard",
  }
}

function errorResult(reason: string, signals: string[]): DispatchResult {
  return {
    state: "error",
    workflowClass: "error",
    primaryAgent: "orchestrator",
    reason,
    signals,
    requiresDiscuss: false,
    needsCodeUnderstanding: false,
    complexity: "standard",
  }
}

/**
 * Persist a routing decision to the audit log.
 */
export function logRoutingDecision(
  directory: string,
  dispatch: DispatchResult,
  sessionID?: string,
): void {
  appendAuditEvent(directory, {
    kind: "routing.decision",
    session_id: sessionID,
    decision: dispatch.workflowClass,
    reason: dispatch.reason,
    details: {
      state: dispatch.state,
      primary_agent: dispatch.primaryAgent,
      signals: dispatch.signals,
      requires_discuss: dispatch.requiresDiscuss,
      needs_code_understanding: dispatch.needsCodeUnderstanding,
      complexity: dispatch.complexity,
    },
  })
}

/**
 * Select workflow class and primary agent from a task description.
 *
 * Uses the existing adaptive router when possible; falls back to a simple
 * classification for empty/short inputs so session-start never throws.
 */
export function dispatchTask(description: unknown): DispatchResult {
  if (typeof description !== "string") {
    return errorResult("task description must be a string", ["invalid_input"])
  }

  const trimmed = description.trim()

  if (trimmed.length > MAX_TASK_DESCRIPTION_LENGTH) {
    return blockedResult(
      `task description exceeds ${MAX_TASK_DESCRIPTION_LENGTH} characters`,
      ["oversized_input"],
    )
  }

  if (!trimmed) {
    return {
      state: "executable",
      workflowClass: "explore",
      primaryAgent: "discusser",
      reason: "empty task description",
      signals: ["empty_input"],
      requiresDiscuss: true,
      needsCodeUnderstanding: false,
      complexity: "standard",
    }
  }

  const route = buildAdaptiveWorkflow(trimmed)
  const complexity = classifyTaskComplexity(trimmed).complexity
  const workflowClass = route.workflowClass ?? "standard"
  const primaryAgent =
    PRIMARY_AGENT_BY_WORKFLOW[workflowClass] ??
    PRIMARY_AGENT_BY_TASK_TYPE[route.taskType] ??
    "planner"

  return {
    state: "executable",
    workflowClass,
    primaryAgent,
    reason: route.reason ?? `task type ${route.taskType}`,
    signals: route.classificationSignals ?? [],
    requiresDiscuss: route.requiresDiscuss ?? true,
    needsCodeUnderstanding: route.needsCodeUnderstanding ?? false,
    complexity,
  }
}
