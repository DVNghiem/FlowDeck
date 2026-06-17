/**
 * Orchestrator Guard Hook
 *
 * Enforces the "orchestrator as coordinator, not executor" rule for the primary session.
 * The orchestrator may inspect files and planning state directly, but it CANNOT
 * use file-write, edit, or shell tools. Those MUST be routed to specialist agents
 * or the default-executor.
 *
 * Enforcement model: **deny-by-default for the primary session**. Any tool that is
 * not explicitly in the read-only allowlist (or a recognized read-only prefix) is
 * rejected. This is intentionally stricter than a denylist: a brand-new or unknown
 * tool name must not silently slip through.
 *
 * The guard is intentionally loose about *which* MCP backs a tool — it accepts
 * common read-only MCP families (codegraph, context7, websearch/exa, grep_app,
 * github, memory, sequential-thinking). For mutating/destructive operations on
 * those same MCPs (clear cache, invalidate cache, mutate config, write file
 * helpers, etc.) the orchestrator must still delegate. Those mutating suffixes
 * are explicitly listed in MUTATING_SUFFIXES below and rejected.
 *
 * Routing options shown when the guard blocks a tool call are supplied via
 * constructor injection (`OrchestratorGuard({ routes })`). The plugin entry
 * point builds the route list from the compiled agent registry and passes
 * it in once at load time. The guard never reads the filesystem itself;
 * add or remove an agent in the registry and the route list updates on
 * the next plugin load.
 *
 * To disable: set FLOWDECK_ORCHESTRATOR_GUARD=off in the environment.
 * Default is ON.
 */

import type { AgentRoute } from "../agents/routing"
import { classifyShellCommand, type ShellCategory } from "../services/shell-command-classifier"

const DISABLED = process.env.FLOWDECK_ORCHESTRATOR_GUARD === "off"

/**
 * Routing/tool-selection hint captured by the plugin entry point when a
 * command is dispatched. Passed to the orchestrator guard so downstream
 * hooks (loop-detector, tool-guard, future tool-selection) can react to the
 * route without re-running the policy.
 */
export interface OrchestratorRoutingHint {
  runId: string
  workflowClass: string
  isTrivialChat: boolean
  toolFamily: { family: string; mcp: string | null; preferred: boolean } | null
  tokenOptimizationActive: boolean
  readiness: { statePresent: boolean; stateFresh: boolean; codebaseIndexPresent: boolean; codegraphReady: boolean }
  routeSignals: string[]
}

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

/**
 * Shell-execution tool names. These are NOT in BLOCKED_TOOLS because the
 * orchestrator IS allowed to use them for read-only shell inspection. Each
 * call is classified by `classifyShellCommand()` inside `check()` and admitted
 * only when the command is "read" (or "sensitive-read" with the appropriate
 * diagnostic). Mutating / risky / unknown / missing-arg commands are
 * rejected with a category-tagged error.
 */
const SHELL_TOOLS = new Set([
  "bash",
  "run_bash",
  "run-bash",
  "execute",
  "run_command",
  "run-command",
  "terminal",
  "shell",
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
  "policy-engine",
  // Analysis — codegraph has a multiplexed API; the bare "codegraph" tool is
  // a dispatcher. We allow it ONLY when the caller's `action` arg is a
  // read-only action. The dispatch path in `checkMultiplexedToolAction()`
  // below enforces that; the bare name being on this list is just a fast
  // path for the read-only cases.
  "codegraph",
  "codegraph-search",
  "codegraph-node",
  "codegraph-explore",
  "codegraph-context",
  "codegraph-callers",
  "codegraph-callees",
  "codegraph-impact",
  "codegraph-trace",
  "codegraph-files",
  "codegraph-status",
  // Rules
  "load-rules",
  "list-rules",
  // Lessons / review
  "review-lessons",
  "capture-lesson",
  // Council / supervision
  "failure-replay",
  // OpenCode native @agent delegation
  "task",
  // Background subagent execution
  "background-agent",
  "check-background-agent",
  "list-background-agents",
  // Common *read-only* MCP entry points. The bare MCP name (e.g. "websearch",
  // "context7") is accepted; mutating/destructive operations on these MCPs are
  // rejected via MUTATING_SUFFIXES below. `codegraph` and `memory` are
  // exceptions — they have a multiplexed action arg and are gated by
  // checkMultiplexedToolAction() inside `check()`.
  "context7",
  "websearch",
  "exa",
  "grep_app",
  "github",
  "memory",
  "sequentialThinking",
  "sequential-thinking",
  "token-optimizer",
  "tokenOptimizer",
])

/**
 * Read-only MCP family prefixes. Tools named `<prefix>_*` (or `<prefix>` alone)
 * are considered read-only and allowed for the orchestrator — EXCEPT when the
 * tail matches one of the mutating suffixes in MUTATING_SUFFIXES.
 *
 * `memory` is intentionally NOT in this list. The bare `memory` MCP tool is a
 * multiplexed dispatcher; the caller's `action` arg (create_entities, add,
 * delete, etc.) decides whether the call is mutating. The fast path for
 * multiplexed read-only actions is handled by checkMultiplexedToolAction()
 * inside `check()`.
 *
 * Examples that ARE allowed:
 *   codegraph_search, codegraphFiles, codegraph-context
 *   context7_resolve-library-id, context7QueryDocs
 *   websearch_exa_search, websearchWebSearch
 *
 * Examples that are NOT allowed (mutating):
 *   codegraph_init_index       — mutates project state
 *   tokenOptimizer_clear_cache — destructive
 *   tokenOptimizer_cache_invalidation — destructive
 *   memory_add_observations    — mutating suffix "add"
 *   memory_set                 — mutating suffix "set"
 */
const READ_ONLY_PREFIXES: ReadonlyArray<string> = [
  "codegraph",
  "codegraph_",
  "codegraph-",
  "context7",
  "context7_",
  "context7-",
  "websearch",
  "websearch_",
  "websearch-",
  "exa",
  "exa_",
  "exa-",
  "grep_app",
  "grep_app_",
  "grep_app-",
  "grepApp",
  "grepApp_",
  "grepApp-",
  "github",
  "github_",
  "github-",
  "sequentialThinking",
  "sequentialThinking_",
  "sequentialThinking-",
  "sequential-thinking",
  "sequential-thinking_",
  "sequential-thinking-",
  "token-optimizer",
  "token-optimizer_",
  "token-optimizer-",
  "tokenOptimizer",
  "tokenOptimizer_",
  "tokenOptimizer-",
]

/**
 * Suffixes that turn a normally read-only MCP tool into a mutating/destructive
 * operation. The orchestrator must delegate these. Matches are performed on the
 * normalized (lowercased, no `-`/`_`) tool name, so separators in the original
 * tool name are irrelevant.
 *
 * Covers the mutating endpoints exposed by the token-optimizer MCP
 * (clear_cache, cache_invalidation, optimize_text, etc.) and the destructive
 * operations on codegraph (init_index, install, refresh).
 */
const MUTATING_SUFFIXES: ReadonlyArray<string> = [
  // Generic mutating operations
  "clear",
  "clear_cache",
  "clearcache",
  "delete",
  "destroy",
  "drop",
  "evict",
  "forget",
  "invalidate",
  "purge",
  "remove",
  "reset",
  "set",
  "truncate",
  "update",
  "upsert",
  "write",
  // token-optimizer mutating endpoints (see token-optimizer-mcp)
  "cache_invalidation",
  "cacheinvalidation",
  "cache_invalidate",
  "cache_warmup",
  "cachewarmup",
  "cache_partition",
  "cache_replication",
  "cache_compression",
  "compress_text",
  "decompress_text",
  "optimize_text",
  "optimize_session",
  "predictive_cache",
  "analyze_project_tokens",
  "alert_manager",
  "metric_collector",
  "log_dashboard",
  "monitoring_integration",
  "smart_api_fetch",
  "smart_build",
  "smart_cache",
  "smart_cron",
  "smart_database",
  "smart_diff",
  "smart_docker",
  "smart_edit",
  "smart_install",
  "smart_lint",
  "smart_log",
  "smart_logs",
  "smart_merge",
  "smart_migration",
  "smart_network",
  "smart_orm",
  "smart_processes",
  "smart_rest",
  "smart_schema",
  "smart_sql",
  "smart_status",
  "smart_system_metrics",
  "smart_test",
  "smart_typecheck",
  "smart_user",
  "smart_websocket",
  "smart_write",
  "smart_branch",
  "smart_ast_grep",
  "smart_graphql",
  "custom_widget",
  "data_visualizer",
  "natural_language_query",
  "predictive_analytics",
  "recommendation_engine",
  "pattern_recognition",
  "intelligent_assistant",
  "get_session_stats",
  "get_cache_stats",
  "count_tokens",
  // codegraph mutating endpoints
  "init_index",
  "initindex",
  "install",
  "refresh",
  "reindex",
  "sync",
  // filesystem mutators surfaced through MCPs
  "create",
  "edit",
  "patch",
  "upload",
  "download",
  // runtime-mutating shell-ish
  "execute",
  "run",
  "shell",
  "bash",
]

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, "")
}

/**
 * Match a tool name against a list of allowed prefixes (normalized).
 *
 * Returns true if the tool name equals any of the prefixes (after normalization)
 * or starts with `<prefix><separator-or-end>`.
 */
function matchesAnyPrefix(name: string, prefixes: ReadonlyArray<string>): boolean {
  const norm = normalizeToolName(name)
  for (const p of prefixes) {
    const np = normalizeToolName(p)
    if (norm === np) return true
    if (norm.startsWith(np)) return true
  }
  return false
}

/**
 * Returns the mutating tail of a normalized tool name, or null if the tail
 * doesn't end with any MUTATING_SUFFIXES entry. E.g. `tokenoptimizersmartcache`
 * → `smartcache` (matched).
 */
function findMutatingTail(name: string): string | null {
  const norm = normalizeToolName(name)
  for (const s of MUTATING_SUFFIXES) {
    const ns = normalizeToolName(s)
    if (norm === ns) return ns
    if (norm.endsWith(ns)) return ns
  }
  return null
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

function isShellTool(name: string): boolean {
  return SHELL_TOOLS.has(normalizeToolName(name))
}

/**
 * Extract the shell command string from a tool call's args. MCP / OpenCode
 * shell tools accept the command under `command`, `cmd`, or `script`. Returns
 * null when no command string is present (conservative: deny).
 */
function readCommandArg(args: unknown): string | null {
  if (!args || typeof args !== "object") return null
  const obj = args as Record<string, unknown>
  for (const key of ["command", "cmd", "script"]) {
    const v = obj[key]
    if (typeof v === "string" && v.trim().length > 0) return v
  }
  return null
}

/**
 * Multiplexed tool families. The bare MCP tool name is a dispatcher that
 * takes an `action` (or `mode` / `operation`) argument selecting the real
 * operation. The orchestrator may invoke the read-only actions; the
 * mutating actions must be delegated.
 *
 * `memory` is the canonical example (server-memory MCP exposes
 * create_entities / add_observations / delete_observations / etc.). `codegraph`
 * follows the same pattern (check / install / init / refresh). For these
 * tools the bare name alone is NOT a sufficient allow — we must look at
 * the action arg. Bare `codegraph_*` and `memory_*` suffixed tool names are
 * still rejected by MUTATING_SUFFIXES, but the *bare* dispatcher needs an
 * extra check.
 */
const MULTIPLEXED_TOOLS = new Set(["codegraph", "memory"])

/**
 * Read-only actions for the multiplexed dispatcher tools. Match is
 * case-insensitive on the action string. Any action NOT in this set is
 * considered mutating and rejected for the orchestrator.
 */
const CODEGRAPH_READ_ONLY_ACTIONS: ReadonlySet<string> = new Set([
  "check",
  "status",
  "query",
  "search",
  "context",
  "explore",
  "files",
  "file_list",
  "file",
  "node",
  "callers",
  "callees",
  "impact",
  "trace",
  "dependencies",
  "dependents",
  "summary",
  "read",
  "get",
  "list",
  "find_references",
  "find_usages",
  "definitions",
])

const MEMORY_READ_ONLY_ACTIONS: ReadonlySet<string> = new Set([
  "read_graph",
  "search_nodes",
  "open_nodes",
  "get_entities",
  "get_relations",
  "search",
  "query",
  "read",
  "get",
  "list",
  "view",
  "status",
])

/**
 * Resolve the action arg from a tool call. MCP tools conventionally accept
 * the discriminator under `action`, `mode`, `operation`, or `command`.
 */
function getMultiplexedAction(args: unknown): string | null {
  if (!args || typeof args !== "object") return null
  const obj = args as Record<string, unknown>
  for (const key of ["action", "mode", "operation", "command"]) {
    const v = obj[key]
    if (typeof v === "string" && v.trim().length > 0) {
      return v.trim().toLowerCase()
    }
  }
  return null
}

/**
 * Returns true when the tool name corresponds to a multiplexed dispatcher
 * whose `args.action` (or equivalent) is a read-only action. Returns false
 * for:
 *   - non-multiplexed tools (caller should fall through to the regular
 *     allow/deny check)
 *   - multiplexed tools with no action arg (conservative: deny)
 *   - multiplexed tools with a mutating action
 *
 * Conservatively returns false when args are missing so the orchestrator
 * never silently slips through a mutating call.
 */
function isReadOnlyMultiplexedAction(toolName: string, args: unknown): boolean | null {
  const norm = normalizeToolName(toolName)
  // Only check the BARE dispatcher name. Suffix-based variants
  // (e.g. codegraph_install) are caught by MUTATING_SUFFIXES already.
  if (!MULTIPLEXED_TOOLS.has(norm)) return null
  const action = getMultiplexedAction(args)
  if (action === null) {
    // No action arg provided for a multiplexed tool — be conservative
    // and deny. The orchestrator can still ask for a specific action
    // explicitly. The cost of being too lenient (allowing a default
    // install/init) is much higher than the cost of an extra delegate.
    return false
  }
  if (norm === "codegraph") {
    return CODEGRAPH_READ_ONLY_ACTIONS.has(action)
  }
  if (norm === "memory") {
    return MEMORY_READ_ONLY_ACTIONS.has(action)
  }
  return false
}

/**
 * Returns true when the tool name is in a recognized read-only MCP family and
 * does NOT end with a mutating suffix. Used to admit a broader set of read-only
 * MCP operations without enumerating every individual tool.
 */
function isReadOnlyMcpTool(name: string): boolean {
  if (!matchesAnyPrefix(name, READ_ONLY_PREFIXES)) return false
  return findMutatingTail(name) === null
}

export class OrchestratorGuard {
  private primarySessionId: string | null = null
  private lastRoutingHint: OrchestratorRoutingHint | undefined = undefined
  private readonly routes: AgentRoute[]

  constructor(options?: { routes?: AgentRoute[] }) {
    this.routes = options?.routes ?? []
  }

  /** Format the injected route list into the routing-options block of the error message. */
  private buildRoutingOptions(): string {
    return this.routes
      .map(r => `  @${r.name.padEnd(22)} — ${r.description}`)
      .join("\n")
  }

  private blockMessage(toolName: string): string {
    const routing = this.buildRoutingOptions()
    const routingSection = routing.length > 0
      ? `Routing options:\n${routing}\n\n`
      : "Routing options: (no agents registered — this should be impossible by construction; please report this as a bug)\n\n"
    return (
      `[Orchestrator Guard] The orchestrator cannot use \`${toolName}\` directly.\n\n` +
      `The orchestrator is a coordinator, not an executor.\n\n` +
      routingSection +
      `Read-only tools allowed for orchestrator: read, search, planning-state, codebase-state, repo-memory, policy-engine, codegraph (read-only actions only), codegraph-*, load-rules, list-rules, failure-replay, task, background-agent, check-background-agent, list-background-agents, review-lessons, capture-lesson, and read-only MCP families (codegraph, context7, exa/websearch, grep_app, github, sequential-thinking, token-optimizer). The memory MCP is a multiplexed dispatcher — only read-only actions (search_nodes, read_graph, etc.) are allowed. Mutating/destructive MCP operations (install, init, refresh, sync, create, add, delete, clear cache, invalidate, write, etc.) are NOT allowed — route to a specialist agent.\n\n` +
      `Read-only shell inspection (ls, pwd, find, head, tail, cat, git status, git diff, etc.) is also allowed directly via the bash/shell/run_bash tool. The guard classifies each command and only admits inspection-grade invocations. Mutating / risky / sensitive-path shell commands are still blocked.\n\n` +
      `To disable this guard: set FLOWDECK_ORCHESTRATOR_GUARD=off`
    )
  }

  /**
   * Format a shell-specific block message. The category is exposed as a
   * `[block-<category>]` tag at the start of the message so callers (and
   * tests) can route on the precise reason. Categories:
   *   - mutating        command mutates filesystem / process / network state
   *   - sensitive-read  command reads from .env / .ssh / /etc/passwd / etc.
   *   - risky           command is operationally dangerous (ssh, traversal, indirection)
   *   - unknown         command could not be confidently classified
   *   - missing-arg     tool call had no command string to inspect
   */
  private shellBlockMessage(toolName: string, reason: string, category: ShellCategory | "missing-arg"): string {
    const routing = this.buildRoutingOptions()
    const routingSection = routing.length > 0
      ? `Routing options:\n${routing}\n\n`
      : "Routing options: (no agents registered — this should be impossible by construction; please report this as a bug)\n\n"
    const categoryLabel = {
      "mutating": "mutating shell command",
      "sensitive-read": "sensitive-path read",
      "risky": "risky shell command",
      "unknown": "unclassified shell command",
      "missing-arg": "shell call with no inspectable command",
      "read": "read-only shell command",
    }[category]
    return (
      `[Orchestrator Guard] [block-${category}] The orchestrator blocked a ${categoryLabel} via \`${toolName}\`.\n\n` +
      `Reason: ${reason}\n\n` +
      `The orchestrator may use read-only shell inspection directly (ls, pwd, find, head, tail, cat on non-sensitive files, git status, git diff, git log, git show, git ls-files, etc.). Mutating shell commands (rm, mv, git commit/push, package install, redirects, eval, source, etc.) and reads from sensitive paths (.env, ~/.ssh, /etc/passwd, *.pem, *.key) must be routed to a specialist agent.\n\n` +
      routingSection +
      `To disable this guard: set FLOWDECK_ORCHESTRATOR_GUARD=off`
    )
  }

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

  check(sessionId: string, toolName: string, args?: unknown): void {
    if (DISABLED) return
    if (this.primarySessionId === null) return
    if (sessionId !== this.primarySessionId) return
    if (isAlwaysAllowed(toolName)) {
      // Multiplexed dispatchers (codegraph, memory) sit on the always-allowed
      // list for the read-only case, but we still need to inspect args when
      // the caller invokes the bare dispatcher. If the args describe a
      // mutating action, reject here.
      const multiplexed = isReadOnlyMultiplexedAction(toolName, args)
      if (multiplexed === false) {
        throw new Error(this.blockMessage(toolName))
      }
      return
    }
    if (isReadOnlyMcpTool(toolName)) return
    // Shell-execution tools: not in BLOCKED_TOOLS, not in ALWAYS_ALLOWED, and
    // not MCP prefixes. The orchestrator IS allowed to use them for read-only
    // inspection, but the actual command must be classified first.
    if (isShellTool(toolName)) {
      const cmd = readCommandArg(args)
      if (cmd === null) {
        throw new Error(this.shellBlockMessage(toolName, "no command string supplied in args", "missing-arg"))
      }
      const cls = classifyShellCommand(cmd, { workingDir: process.cwd() })
      if (cls.category === "read") return
      throw new Error(this.shellBlockMessage(toolName, cls.reason, cls.category))
    }
    // Anything not explicitly allowed for the primary session is rejected.
    // This is a deny-by-default policy: unknown tool names and mutating
    // operations on normally-allowed MCP families both fall through to here.
    throw new Error(this.blockMessage(toolName))
  }

  /**
   * Read-only accessor for the in-flight routing/tool-selection hint
   * associated with the primary session. Returns undefined when no hint has
   * been recorded (e.g. the session was created without a `command.execute.before`
   * passing through FlowDeck).
   *
   * The hint is set by the plugin entry point when a command is dispatched
   * and consumed by downstream hooks (loop-detector, tool-guard) so they
   * can react to the route without re-running the policy.
   */
  getRoutingHint(sessionId: string): OrchestratorRoutingHint | undefined {
    if (this.primarySessionId === null) return undefined
    if (sessionId !== this.primarySessionId) return undefined
    return this.lastRoutingHint
  }

  /** Internal: store the latest routing hint. Called by the plugin entry. */
  _setRoutingHintForTest(hint: OrchestratorRoutingHint | undefined): void {
    this.lastRoutingHint = hint
  }

  /** Exposed for testing. */
  _isBlockedForTest(name: string): boolean {
    return isBlocked(name)
  }

  /** Exposed for testing. */
  _isAllowedForTest(name: string): boolean {
    return isAlwaysAllowed(name)
  }

  /**
   * Exposed for testing. Returns true when a multiplexed tool call (e.g. the
   * bare `codegraph` or `memory` dispatcher) is treated as read-only given
   * the supplied args. Returns null when the tool is not multiplexed.
   */
  _isReadOnlyMultiplexedForTest(name: string, args: unknown): boolean | null {
    return isReadOnlyMultiplexedAction(name, args)
  }

  /** Exposed for testing. */
  _isShellToolForTest(name: string): boolean {
    return isShellTool(name)
  }

  /** Exposed for testing. */
  _readCommandArgForTest(args: unknown): string | null {
    return readCommandArg(args)
  }

  /** Exposed for testing. */
  _classifyShellCommandForTest(command: string, opts?: { workingDir?: string }): {
    category: ShellCategory
    reason: string
    sensitiveMatches: string[]
    head: string | null
  } {
    return classifyShellCommand(command, opts)
  }

  /** Exposed for testing. */
  _setPrimarySessionIdForTest(id: string | null): void {
    this.primarySessionId = id
  }

  /** Returns the tracked primary session ID, or null if not yet known. */
  getPrimarySessionId(): string | null {
    return this.primarySessionId
  }

  /**
   * Exposed for testing. Return the routing-options block the guard would
   * currently emit when it blocks a tool call. Useful for assertions about
   * which agents appear in the dynamic message.
   */
  _getRoutingOptionsForTest(): string {
    return this.buildRoutingOptions()
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
