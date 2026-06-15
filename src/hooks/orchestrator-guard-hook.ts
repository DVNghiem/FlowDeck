/**
 * Orchestrator Guard Hook
 *
 * Enforces the "orchestrator as coordinator, not executor" rule for the primary session.
 * The orchestrator may inspect files and planning state directly, but it CANNOT
 * use file-write, edit, or shell tools. Those MUST be routed to specialist agents
 * or the default-executor.
 *
 * To disable: set FLOWDECK_ORCHESTRATOR_GUARD=off in the environment.
 * Default is ON.
 */

import { AGENT_NAMES } from "../agents/index"

const DISABLED = process.env.FLOWDECK_ORCHESTRATOR_GUARD === "off"

/** Tools that modify files or execute commands — BLOCKED for orchestrator. */
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
  // Code execution
  "python",
  "run_python",
  "js",
  "run_js",
  // Build/test runners that execute commands
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "cargo",
  "go",
  "make",
  "cmake",
  // Container/deployment
  "docker",
  "kubectl",
  "terraform",
  "pulumi",
])

/** Tools that are ALWAYS allowed for the orchestrator (read-only and planning). */
const ALWAYS_ALLOWED = new Set([
  // Read/search
  "read",
  "read_file",
  "view",
  "search",
  "grep",
  "glob",
  // Planning and state
  "planning-state",
  "codebase-state",
  "repo-memory",
  "decision-trace",
  "policy-engine",
  "reflect",
  // Analysis
  "codegraph",
  "codegraph-search",
  "codegraph-node",
  "codegraph-explore",
  // Rules
  "load-rules",
  "list-rules",
  // Council / supervision
  "council",
  // Hash edit (read-only verification)
  "hash-edit",
  // Failure replay
  "failure-replay",
  // OpenCode native @agent delegation
  "task",
  // Background subagent execution
  "background-agent",
  "check-background-agent",
  "list-background-agents",
])

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, "")
}

function isBlocked(name: string): boolean {
  const norm = normalizeToolName(name)
  for (const b of BLOCKED_TOOLS) {
    if (norm === normalizeToolName(b)) return true
  }
  return false
}

function isAlwaysAllowed(name: string): boolean {
  const norm = normalizeToolName(name)
  for (const a of ALWAYS_ALLOWED) {
    if (norm === normalizeToolName(a)) return true
  }
  return false
}

function buildRoutingOptions(): string {
  return AGENT_NAMES
    .filter(name => name !== "orchestrator")
    .map(name => `  @${name.padEnd(22)} — specialist agent`)
    .join("\n")
}

function blockMessage(toolName: string): string {
  return (
    `[Orchestrator Guard] The orchestrator cannot use \`${toolName}\` directly.\n\n` +
    `The orchestrator is a coordinator, not an executor.\n\n` +
    `Routing options:\n` +
    `${buildRoutingOptions()}\n\n` +
    `Allowed tools for orchestrator: read, search, planning-state, codebase-state, repo-memory, decision-trace, policy-engine, reflect, codegraph, load-rules, council, hash-edit, failure-replay, task.\n\n` +
    `To disable this guard: set FLOWDECK_ORCHESTRATOR_GUARD=off`
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
    if (isAlwaysAllowed(toolName)) return
    if (isBlocked(toolName)) {
      throw new Error(blockMessage(toolName))
    }
  }

  /** Exposed for testing. */
  _isBlockedForTest(name: string): boolean {
    return isBlocked(name)
  }

  /** Exposed for testing. */
  _isAllowedForTest(name: string): boolean {
    return isAlwaysAllowed(name)
  }

  /** Exposed for testing. */
  _setPrimarySessionIdForTest(id: string | null): void {
    this.primarySessionId = id
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
