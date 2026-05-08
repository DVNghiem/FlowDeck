/**
 * Orchestrator Guard Hook
 *
 * Enforces the "orchestrator as coordinator only" rule:
 * the primary orchestrator session is not allowed to use file-writing or shell-execution
 * tools directly. It must delegate all such work via the `delegate` tool.
 *
 * Detection: the FIRST session.created event is treated as the orchestrator's session.
 * Child sessions (created by `delegate`) always arrive after the primary one.
 *
 * To enable: set FLOWDECK_ORCHESTRATOR_GUARD=on in the environment.
 * Default is OFF (guard disabled unless explicitly enabled).
 */

const DISABLED = process.env.FLOWDECK_ORCHESTRATOR_GUARD !== "on"

// Tools the orchestrator must NEVER call directly.
// Read-only tools (read_file, glob, grep, list) are intentionally allowed —
// the orchestrator legitimately reads STATE.md and PLAN.md.
const BLOCKED_TOOLS = new Set([
  // File writes
  "write_file",
  "write",
  "create_file",
  "create",
  // File edits
  "edit_file",
  "edit",
  "patch",
  "apply_patch",
  "str_replace_editor",
  "str_replace",
  // Shell execution
  "bash",
  "run_bash",
  "execute",
  "run_command",
  "terminal",
  "shell",
])

// FlowDeck coordination tools that the orchestrator is ALWAYS allowed to use.
const ALWAYS_ALLOWED = new Set([
  "delegate",
  "run-pipeline",
  "council",
  "planning-state",
  "codebase-state",
  "workspace-state",
  "repo-memory",
  "decision-trace",
  "policy-engine",
  "context-generator",
  "create-skill",
  "reflect",
])

function isDelegationTool(name: string): boolean {
  return ALWAYS_ALLOWED.has(name)
}

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
    `The orchestrator is a coordinator — it must delegate all implementation work.\n\n` +
    `Use the \`delegate\` tool to hand this off:\n` +
    `  delegate({ agent: "@backend-coder", prompt: "..." })      — backend code writing / editing\n` +
    `  delegate({ agent: "@frontend-coder", prompt: "..." })     — frontend code writing / editing\n` +
    `  delegate({ agent: "@devops", prompt: "..." })             — CI/CD, deploy, and infra changes\n` +
    `  delegate({ agent: "@mapper", prompt: "..." })     — codebase mapping\n` +
    `  delegate({ agent: "@researcher", prompt: "..." }) — research / file analysis\n` +
    `  delegate({ agent: "@tester", prompt: "..." })     — tests / commands\n\n` +
    `To enable this guard: set FLOWDECK_ORCHESTRATOR_GUARD=on`
  )
}

export class OrchestratorGuard {
  private primarySessionId: string | null = null

  /**
   * Call this from the plugin's event handler so the guard can capture the
   * primary session ID the first time a session is created.
   */
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

  /**
   * Call this from tool.execute.before.
   * Throws if the tool is blocked for the orchestrator session.
   */
  check(sessionId: string, toolName: string): void {
    if (DISABLED) return
    if (this.primarySessionId === null) return
    if (sessionId !== this.primarySessionId) return
    if (isDelegationTool(toolName)) return
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
