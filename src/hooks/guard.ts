/**
 * Orchestrator tool guard.
 *
 * @see src/hooks/tdd-guard.ts
 */

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
