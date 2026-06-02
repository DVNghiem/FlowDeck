/**
 * Orchestrator Guard Hook
 *
 * Enforces the "orchestrator as coordinator" rule for the primary session.
 * The orchestrator may inspect files and planning state directly, but it should
 * route file writes and shell-heavy execution to specialist agents instead of
 * using blocked tools in the primary session.
 *
 * To enable: set FLOWDECK_ORCHESTRATOR_GUARD=on in the environment.
 * Default is OFF.
 */

const DISABLED = process.env.FLOWDECK_ORCHESTRATOR_GUARD !== "on"

const BLOCKED_TOOLS = new Set([
  "write_file",
  "write",
  "create_file",
  "create",
  "edit_file",
  "edit",
  "patch",
  "apply_patch",
  "str_replace_editor",
  "str_replace",
  "bash",
  "run_bash",
  "execute",
  "run_command",
  "terminal",
  "shell",
])

const ALWAYS_ALLOWED = new Set([
  "planning-state",
  "codebase-state",
  "repo-memory",
  "decision-trace",
  "policy-engine",
  "reflect",
])

function isBlocked(name: string): boolean {
  const norm = name.toLowerCase().replace(/[-_]/g, "")
  for (const b of BLOCKED_TOOLS) {
    if (norm === b.replace(/[-_]/g, "") || norm === b.replace(/_/g, "")) return true
  }
  return false
}

function blockMessage(toolName: string): string {
  return (
    `[Orchestrator Guard] The orchestrator cannot use \`${toolName}\` directly.\n\n` +
    `Use built-in read/search tools for lightweight inspection, then route execution with OpenCode's native @agent invocation.\n\n` +
    `Recommended handoffs:\n` +
    `  @backend-coder   — backend code writing and editing\n` +
    `  @frontend-coder  — frontend code writing and editing\n` +
    `  @devops          — CI/CD, deploy, and infrastructure changes\n` +
    `  @mapper          — codebase mapping\n` +
    `  @researcher      — focused research and file analysis\n` +
    `  @tester          — tests, builds, and shell-heavy verification\n\n` +
    `To enable this guard: set FLOWDECK_ORCHESTRATOR_GUARD=on`
  )
}

export class OrchestratorGuard {
  private primarySessionId: string | null = null

  onEvent(event: { type?: string; properties?: unknown; event?: unknown; sessionID?: string; sessionId?: string }): void {
    const eventType = event.type ?? ""
    if (eventType === "session.deleted") {
      const deletedId = extractSessionId(event)
      if (deletedId && deletedId === this.primarySessionId) {
        this.primarySessionId = null
      }
      return
    }
    if (eventType !== "session.created" && eventType !== "session.started") return
    if (this.primarySessionId !== null) return

    const id = extractSessionId(event)
    if (!id) return
    if (extractParentSessionId(event)) return
    this.primarySessionId = id
  }

  check(sessionId: string, toolName: string): void {
    if (DISABLED) return
    if (this.primarySessionId === null) return
    if (sessionId !== this.primarySessionId) return
    if (ALWAYS_ALLOWED.has(toolName)) return
    if (isBlocked(toolName)) {
      throw new Error(blockMessage(toolName))
    }
  }
}

function extractSessionId(event: { properties?: unknown; event?: unknown; sessionID?: string; sessionId?: string }): string | null {
  const props = event.properties as Record<string, unknown> | undefined
  const inner = event.event as Record<string, unknown> | undefined
  const info = props?.info as Record<string, unknown> | undefined
  const id =
    (event.sessionID as string | undefined) ??
    (event.sessionId as string | undefined) ??
    (inner?.sessionID as string | undefined) ??
    (inner?.sessionId as string | undefined) ??
    (info?.id as string | undefined)
  return id ?? null
}

function extractParentSessionId(event: { properties?: unknown; event?: unknown }): string | null {
  const props = event.properties as Record<string, unknown> | undefined
  const inner = event.event as Record<string, unknown> | undefined
  const info = props?.info as Record<string, unknown> | undefined
  const parentId =
    (inner?.parentID as string | undefined) ??
    (inner?.parentId as string | undefined) ??
    (info?.parentID as string | undefined) ??
    (info?.parentId as string | undefined)
  return parentId ?? null
}
