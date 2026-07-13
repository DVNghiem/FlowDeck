const BLOCKED_TOOLS = new Set([
  "write",
  "write_file",
  "edit",
  "patch",
  "create",
  "create_file",
  "str_replace",
  "bash",
])

// Tools the orchestrator is always allowed to use
const ALLOWED_TOOLS = new Set([
  "read",
  "fdx-read",
  "fdx-search",
  "fdx-outline",
  "fdx-ls",
  "fdx-tree",
  "fdx-git",
  "task",
  "question",
])

export interface GuardResult {
  allowed: boolean
  reason?: string
}

/**
 * Check if a tool call is allowed for the orchestrator.
 * Only the orchestrator is guarded — subagents have no restrictions.
 */
export function checkOrchestratorTool(
  toolName: string,
  agentName: string | undefined
): GuardResult {
  if (agentName !== "orchestrator") return { allowed: true }
  if (BLOCKED_TOOLS.has(toolName)) {
    return {
      allowed: false,
      reason: `Orchestrator cannot use \`${toolName}\` directly. Delegate to the appropriate agent via the task tool.`,
    }
  }
  return { allowed: true }
}

/**
 * Track files written in current step execution.
 * Used by TDD guard to enforce test-first workflow.
 */
const stepWriteTracker = new Map<string, Set<string>>()

/** Clear write tracker for a new step */
export function clearStepWrites(stepId: string): void {
  stepWriteTracker.delete(stepId)
}

/** Record a file write for the current step */
export function recordStepWrite(stepId: string, filePath: string): void {
  if (!stepWriteTracker.has(stepId)) {
    stepWriteTracker.set(stepId, new Set())
  }
  stepWriteTracker.get(stepId)!.add(filePath)
}

/** Check if file is a test file */
function isTestFile(filePath: string): boolean {
  return (
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.includes("_test.") ||
    filePath.includes("/tests/") ||
    filePath.includes("/test/") ||
    filePath.includes("/__tests__/")
  )
}

/** Check if file is exempt from TDD guard */
function isTddExempt(filePath: string): boolean {
  return (
    filePath.endsWith(".md") ||
    filePath.endsWith(".json") ||
    filePath.endsWith(".yaml") ||
    filePath.endsWith(".yml") ||
    filePath.endsWith(".env") ||
    filePath.endsWith(".sql") ||
    filePath.endsWith(".yml")
  )
}

/** TDD guard: enforce test-first workflow for coder agents */
export function checkTddGuard(
  stepId: string,
  filePath: string,
  isCoderAgent: boolean
): { allowed: boolean; reason?: string } {
  // Guard only applies to coder agents
  if (!isCoderAgent) {
    return { allowed: true }
  }

  // Guard is opt-in via environment variable, default ON
  const guardEnabled = process.env.FLOWDECK_TOOL_GUARD_ENABLED !== "off"
  if (!guardEnabled) {
    return { allowed: true }
  }

  // Exempt files from TDD guard
  if (isTddExempt(filePath)) {
    return { allowed: true }
  }

  const writes = stepWriteTracker.get(stepId) || new Set()

  // If no writes yet: allow (this will be the first write)
  if (writes.size === 0) {
    recordStepWrite(stepId, filePath)
    // If it's not a test file, block
    if (!isTestFile(filePath)) {
      return {
        allowed: false,
        reason: "[TDD Guard] Write a failing test for this step before implementing production code.",
      }
    }
    return { allowed: true }
  }

  // If there are writes and this is production code after a test: allow
  if (isTestFile(filePath)) {
    recordStepWrite(stepId, filePath)
    return { allowed: true }
  }

  recordStepWrite(stepId, filePath)
  return { allowed: true }
}
