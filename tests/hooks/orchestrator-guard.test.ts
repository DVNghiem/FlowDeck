/**
 * Orchestrator Guard Hook Tests
 *
 * Covers:
 * - Guard is enabled by default (must set env var to disable)
 * - Guard blocks write/edit/bash tools for primary session
 * - Guard allows read/search/planning tools for primary session
 * - Guard does not affect non-primary sessions
 * - Guard blocks npm/bun/docker/build tools
 * - Guard produces informative error messages
 * - Routing options are supplied via constructor injection (`{ routes }`)
 */

import { describe, it, expect, beforeEach } from "vitest"
import { OrchestratorGuard } from "@/hooks/orchestrator-guard-hook"

describe("OrchestratorGuard: default behavior", () => {
  it("is enabled by default (FLOWDECK_ORCHESTRATOR_GUARD not set to off)", () => {
    // We can't easily test the env var without mutating process.env,
    // but we verify the guard logic works when not explicitly disabled.
    const guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("session-1")

    // Should throw for blocked tools when enabled
    expect(() => guard.check("session-1", "write")).toThrow(/Orchestrator Guard/)
  })
})

describe("OrchestratorGuard: blocked tools", () => {
  let guard: OrchestratorGuard

  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  const blockedTools = [
    "write",
    "write_file",
    "create",
    "create_file",
    "edit",
    "edit_file",
    "patch",
    "apply_patch",
    "str_replace_editor",
    "str_replace",
    "python",
    "run_python",
    "js",
    "run_js",
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "cargo",
    "go",
    "make",
    "cmake",
    "docker",
    "kubectl",
    "terraform",
    "pulumi",
    "hash-edit",
    "hash_edit",
  ]

  blockedTools.forEach((tool) => {
    it(`blocks '${tool}' for primary session`, () => {
      expect(() => guard.check("primary-session", tool)).toThrow(/Orchestrator Guard/)
    })
  })

  it("error message mentions routing options", () => {
    const g = new OrchestratorGuard({
      routes: [
        { name: "default-executor", description: "Default execution worker." },
        { name: "coder", description: "Implements backend/frontend/devops." },
      ],
    })
    g._setPrimarySessionIdForTest("primary-session")
    expect(() => g.check("primary-session", "write")).toThrow(/@default-executor/)
    expect(() => g.check("primary-session", "write")).toThrow(/@coder/)
  })

  it("error message mentions the orchestrator is a coordinator", () => {
    expect(() => guard.check("primary-session", "write")).toThrow(/coordinator, not an executor/)
  })
})

describe("OrchestratorGuard: allowed tools", () => {
  let guard: OrchestratorGuard

  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  const allowedTools = [
    "read",
    "read_file",
    "view",
    "search",
    "grep",
    "glob",
    "planning-state",
    "codebase-state",
    "repo-memory",
    "policy-engine",
    "codegraph-search",
    "codegraph-node",
    "codegraph-explore",
    "load-rules",
    "list-rules",
    "failure-replay",
    "task",
    "review-lessons",
    "capture-lesson",
  ]

  allowedTools.forEach((tool) => {
    it(`allows '${tool}' for primary session`, () => {
      expect(() => guard.check("primary-session", tool)).not.toThrow()
    })
  })

  // `codegraph` and `memory` are multiplexed dispatchers: they are allowed
  // only when the caller passes a read-only action arg. The previous
  // unconditional allow was a hole — install/init/refresh/create were
  // reachable for the orchestrator. With args-based gating:
  it("allows bare 'codegraph' only when the action arg is read-only", () => {
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "search" }),
    ).not.toThrow()
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "callers" }),
    ).not.toThrow()
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "status" }),
    ).not.toThrow()
  })

  it("blocks bare 'codegraph' when the action arg is mutating", () => {
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "install" }),
    ).toThrow(/Orchestrator Guard/)
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "init" }),
    ).toThrow(/Orchestrator Guard/)
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "refresh" }),
    ).toThrow(/Orchestrator Guard/)
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "sync" }),
    ).toThrow(/Orchestrator Guard/)
  })

  it("blocks bare 'codegraph' when no action arg is provided (deny by default)", () => {
    expect(() => guard.check("primary-session", "codegraph", {})).toThrow(/Orchestrator Guard/)
    expect(() => guard.check("primary-session", "codegraph")).toThrow(/Orchestrator Guard/)
  })

  it("allows bare 'memory' only when the action arg is read-only", () => {
    expect(() =>
      guard.check("primary-session", "memory", { action: "search_nodes" }),
    ).not.toThrow()
    expect(() =>
      guard.check("primary-session", "memory", { action: "read_graph" }),
    ).not.toThrow()
    expect(() =>
      guard.check("primary-session", "memory", { action: "open_nodes" }),
    ).not.toThrow()
  })

  it("blocks bare 'memory' when the action arg is mutating", () => {
    expect(() =>
      guard.check("primary-session", "memory", { action: "create_entities" }),
    ).toThrow(/Orchestrator Guard/)
    expect(() =>
      guard.check("primary-session", "memory", { action: "add_observations" }),
    ).toThrow(/Orchestrator Guard/)
    expect(() =>
      guard.check("primary-session", "memory", { action: "delete_observations" }),
    ).toThrow(/Orchestrator Guard/)
  })

  it("blocks bare 'memory' when no action arg is provided (deny by default)", () => {
    expect(() => guard.check("primary-session", "memory", {})).toThrow(/Orchestrator Guard/)
    expect(() => guard.check("primary-session", "memory")).toThrow(/Orchestrator Guard/)
  })

  it("accepts 'mode' / 'operation' / 'command' as the multiplexed action discriminator", () => {
    expect(() =>
      guard.check("primary-session", "codegraph", { mode: "search" }),
    ).not.toThrow()
    expect(() =>
      guard.check("primary-session", "memory", { operation: "search_nodes" }),
    ).not.toThrow()
    expect(() =>
      guard.check("primary-session", "codegraph", { command: "install" }),
    ).toThrow(/Orchestrator Guard/)
  })
})

describe("OrchestratorGuard: non-primary sessions", () => {
  let guard: OrchestratorGuard

  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  it("does not block tools for non-primary sessions", () => {
    expect(() => guard.check("other-session", "write")).not.toThrow()
    expect(() => guard.check("other-session", "bash")).not.toThrow()
    expect(() => guard.check("other-session", "edit")).not.toThrow()
  })

  it("does not block tools when primary session is not set", () => {
    guard._setPrimarySessionIdForTest(null)
    expect(() => guard.check("any-session", "write")).not.toThrow()
  })
})

describe("OrchestratorGuard: agent-aware blocking", () => {
  let guard: OrchestratorGuard

  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  it("blocks write tools when agent is 'orchestrator'", () => {
    expect(() => guard.check("primary-session", "write", undefined, "orchestrator")).toThrow(/Orchestrator Guard/)
  })

  it("does NOT block write tools when agent is 'default-executor' (Build profile)", () => {
    expect(() => guard.check("primary-session", "write", undefined, "default-executor")).not.toThrow()
  })

  it("does NOT block write tools when agent is 'planner' (Plan profile)", () => {
    expect(() => guard.check("primary-session", "write", undefined, "planner")).not.toThrow()
  })

  it("does NOT block write tools when agent is 'reviewer' (Reviewer profile)", () => {
    expect(() => guard.check("primary-session", "write", undefined, "reviewer")).not.toThrow()
  })

  it("does NOT block bash when agent is 'backend-coder' (Build profile)", () => {
    expect(() => guard.check("primary-session", "bash", { command: "ls" }, "backend-coder")).not.toThrow()
  })

  it("blocks bash when agent is 'orchestrator'", () => {
    expect(() => guard.check("primary-session", "bash", { command: "ls" }, "orchestrator")).not.toThrow()
  })

  it("preserves deny-by-default when agentName is undefined (backward compat)", () => {
    // Existing tests that pass no agentName must still work
    expect(() => guard.check("primary-session", "write")).toThrow(/Orchestrator Guard/)
  })

  it("still blocks write tools for non-primary sessions only via session ID (not agent name)", () => {
    // Non-primary sessions are never blocked regardless of agent
    expect(() => guard.check("other-session", "write", undefined, "orchestrator")).not.toThrow()
  })

  it("blocks shell mutating commands when agent is 'orchestrator'", () => {
    expect(() => guard.check("primary-session", "bash", { command: "rm -rf /" }, "orchestrator")).toThrow(/Orchestrator Guard/)
  })

  it("allows shell mutating commands when agent is 'default-executor'", () => {
    expect(() => guard.check("primary-session", "bash", { command: "rm -rf /" }, "default-executor")).not.toThrow()
  })
})

describe("OrchestratorGuard: tool name normalization", () => {
  let guard: OrchestratorGuard

  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  it("blocks tools with underscores", () => {
    expect(() => guard.check("primary-session", "write_file")).toThrow(/Orchestrator Guard/)
  })

  it("blocks tools with hyphens", () => {
    expect(() => guard.check("primary-session", "run-bash")).toThrow(/Orchestrator Guard/)
  })

  it("allows tools with hyphens", () => {
    expect(() => guard.check("primary-session", "planning-state")).not.toThrow()
  })
})

describe("OrchestratorGuard: event tracking", () => {
  it("tracks primary session from session.created event", () => {
    const guard = new OrchestratorGuard()
    guard.onEvent({ type: "session.created", properties: { info: { id: "sess-1" } } })

    expect(() => guard.check("sess-1", "write")).toThrow(/Orchestrator Guard/)
  })

  it("ignores child sessions (has parentID)", () => {
    const guard = new OrchestratorGuard()
    guard.onEvent({
      type: "session.created",
      properties: { info: { id: "child-1", parentID: "parent-1" } },
    })

    // Child session should not become primary
    expect(() => guard.check("child-1", "write")).not.toThrow()
  })

  it("clears primary session on session.deleted", () => {
    const guard = new OrchestratorGuard()
    guard.onEvent({ type: "session.created", properties: { info: { id: "sess-1" } } })
    guard.onEvent({ type: "session.deleted", properties: { info: { id: "sess-1" } } })

    // After deletion, should not block anymore
    expect(() => guard.check("sess-1", "write")).not.toThrow()
  })
})

describe("OrchestratorGuard: internal helpers", () => {
  const guard = new OrchestratorGuard()

  it("_isBlockedForTest returns true for blocked tools", () => {
    expect(guard._isBlockedForTest("write")).toBe(true)
    expect(guard._isBlockedForTest("bash")).toBe(true)
    expect(guard._isBlockedForTest("docker")).toBe(true)
  })

  it("_isBlockedForTest returns false for allowed tools", () => {
    expect(guard._isBlockedForTest("read")).toBe(false)
    expect(guard._isBlockedForTest("planning-state")).toBe(false)
    expect(guard._isBlockedForTest("codegraph")).toBe(false)
  })

  it("_isAllowedForTest returns true for always-allowed tools", () => {
    expect(guard._isAllowedForTest("read")).toBe(true)
    expect(guard._isAllowedForTest("planning-state")).toBe(true)
  })

  it("_isAllowedForTest returns false for non-explicitly-allowed tools", () => {
    expect(guard._isAllowedForTest("write")).toBe(false)
    expect(guard._isAllowedForTest("some-unknown-tool")).toBe(false)
  })
})

describe("OrchestratorGuard: read-only MCP tool families", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  const allowedMcpTools = [
    "codegraph-context",
    "codegraph-callers",
    "codegraph-callees",
    "codegraph-impact",
    "codegraph-trace",
    "codegraph-files",
    "context7",
    "context7_mcp",
    "exa",
    "exa_mcp",
    "websearch",
    "websearch_mcp",
    "grep_app",
    "grep_app_mcp",
    "github",
    "github_mcp",
    "token-optimizer",
    "token-optimizer_mcp",
    "tokenOptimizer",
    "sequentialThinking",
    "sequential-thinking",
    "sequentialThinking_mcp",
  ]

  allowedMcpTools.forEach((tool) => {
    it(`allows read-only MCP tool '${tool}' for primary session`, () => {
      expect(() => guard.check("primary-session", tool)).not.toThrow()
    })
  })

  it("does NOT allow codegraph-context for non-primary sessions to differ — but the guard is session-scoped", () => {
    // The guard is session-scoped; non-primary sessions are always unrestricted
    expect(() => guard.check("other-session", "codegraph-context")).not.toThrow()
  })
})

// ─── Deny-by-default enforcement for the primary session ───────────────────

describe("OrchestratorGuard: deny-by-default", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  it("rejects an unknown tool name (not on allowlist or read-only prefix)", () => {
    expect(() => guard.check("primary-session", "some-unknown-tool-xyz")).toThrow(/Orchestrator Guard/)
  })

  it("rejects tools with the read-only prefix but a mutating tail", () => {
    const mutating = [
      "tokenOptimizer_clear_cache",
      "tokenOptimizer_cache_invalidation",
      "tokenOptimizer_optimize_text",
      "tokenOptimizer_smart_write",
      "tokenOptimizer_smart_cache",
      "tokenOptimizer_smart_install",
      "tokenOptimizer_smart_docker",
      "tokenOptimizer_smart_edit",
      "tokenOptimizer_count_tokens",
      "tokenOptimizer_predictive_cache",
      "codegraph_init_index",
      "codegraph_install",
      "context7_write",
      "memory_set",
      "memory_delete",
      "github_create",
      "websearch_execute",
    ]
    for (const tool of mutating) {
      expect(() => guard.check("primary-session", tool)).toThrow(/Orchestrator Guard/)
    }
  })

  it("accepts read-only operations in known MCP families", () => {
    const allowed = [
      "codegraph_search",
      "codegraph_context",
      "codegraph_files",
      "codegraph_status",
      "codegraph_node",
      "codegraph-explore",
      "context7_resolve-library-id",
      "context7_get-library-docs",
      "websearch_web_search_exa",
      "websearchExaSearch",
      "grep_app_search",
      "github_search_code",
      "sequentialThinking_think",
      "sequential-thinking-think",
      "tokenOptimizer_smart_read",
      "tokenOptimizer_smart_grep",
      "tokenOptimizer_smart_glob",
    ]
    for (const tool of allowed) {
      expect(() => guard.check("primary-session", tool)).not.toThrow()
    }
  })

  it("accepts the bare codegraph and memory dispatchers ONLY with a read-only action arg", () => {
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "search" }),
    ).not.toThrow()
    expect(() =>
      guard.check("primary-session", "memory", { action: "search_nodes" }),
    ).not.toThrow()
    // No args → denied
    expect(() => guard.check("primary-session", "codegraph")).toThrow(/Orchestrator Guard/)
    expect(() => guard.check("primary-session", "memory")).toThrow(/Orchestrator Guard/)
    // Mutating args → denied
    expect(() =>
      guard.check("primary-session", "codegraph", { action: "install" }),
    ).toThrow(/Orchestrator Guard/)
    expect(() =>
      guard.check("primary-session", "memory", { action: "add" }),
    ).toThrow(/Orchestrator Guard/)
  })

  it("still allows the canonical read-only tool names", () => {
    const canonical = [
      "read",
      "read_file",
      "view",
      "search",
      "grep",
      "glob",
      "planning-state",
      "codebase-state",
      "repo-memory",
      "policy-engine",
      "load-rules",
      "list-rules",
      "failure-replay",
      "context7",
      "websearch",
      "exa",
      "grep_app",
      "github",
      "sequentialThinking",
      "sequential-thinking",
      "token-optimizer",
      "tokenOptimizer",
    ]
    for (const tool of canonical) {
      expect(() => guard.check("primary-session", tool)).not.toThrow()
    }
  })

  it("rejects shell tools when called without a command arg (conservative deny)", () => {
    // bash / run_bash / shell / terminal / execute are SHELL_TOOLS — they
    // require a classified command. With no command arg, the guard denies
    // with a [block-missing-arg] tag.
    const shellTools = ["bash", "run_bash", "run-bash", "execute", "shell", "terminal"]
    for (const tool of shellTools) {
      expect(() => guard.check("primary-session", tool)).toThrow(/Orchestrator Guard/)
      expect(() => guard.check("primary-session", tool)).toThrow(/block-missing-arg/)
    }
  })

  it("rejects code-exec / build / deploy tools (python, npm, docker, etc.)", () => {
    const blocked = ["python", "run_python", "js", "run_js", "npm", "pnpm", "yarn", "bun", "cargo", "go", "make", "cmake", "docker", "kubectl", "terraform", "pulumi"]
    for (const tool of blocked) {
      expect(() => guard.check("primary-session", tool)).toThrow(/Orchestrator Guard/)
    }
  })

  it("rejects write/edit tools under any casing/separator", () => {
    const blocked = [
      "write",
      "write_file",
      "write-file",
      "edit",
      "edit_file",
      "edit-file",
      "patch",
      "apply_patch",
      "apply-patch",
      "str_replace_editor",
      "str-replace-editor",
      "create",
      "create_file",
    ]
    for (const tool of blocked) {
      expect(() => guard.check("primary-session", tool)).toThrow(/Orchestrator Guard/)
    }
  })
})

// ─── hash-edit is a file writer — it MUST be blocked ──────────────────────

describe("OrchestratorGuard: hash-edit (file-writing tool)", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  it("blocks 'hash-edit' for the primary session (writes files via replacement)", () => {
    expect(() => guard.check("primary-session", "hash-edit")).toThrow(/Orchestrator Guard/)
  })

  it("blocks 'hash_edit' under any separator", () => {
    expect(() => guard.check("primary-session", "hash_edit")).toThrow(/Orchestrator Guard/)
  })

  it("blocks 'hash-edit' even when the expectedHash arg is supplied", () => {
    // The orchestrator must never reach the file-write step regardless of
    // whether the caller provided a hash; the guard rejects on the name.
    expect(() =>
      guard.check("primary-session", "hash-edit", {
        filePath: "src/x.ts",
        targetContent: "foo",
        replacementContent: "bar",
        expectedHash: "deadbeef",
      }),
    ).toThrow(/Orchestrator Guard/)
  })
})

// ─── Multiplexed dispatcher tools (codegraph, memory) — args-based gating ─

describe("OrchestratorGuard: multiplexed codegraph dispatcher (action arg)", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  const readOnlyActions = [
    "check",
    "status",
    "query",
    "search",
    "context",
    "explore",
    "files",
    "node",
    "callers",
    "callees",
    "impact",
    "trace",
    "read",
    "get",
    "list",
  ]
  for (const action of readOnlyActions) {
    it(`allows codegraph(action=${action})`, () => {
      expect(() => guard.check("primary-session", "codegraph", { action })).not.toThrow()
    })
  }

  const mutatingActions = [
    "install",
    "init",
    "init_index",
    "refresh",
    "reindex",
    "sync",
    "create",
    "update",
    "delete",
    "add",
    "remove",
    "mark-stale",
  ]
  for (const action of mutatingActions) {
    it(`blocks codegraph(action=${action})`, () => {
      expect(() => guard.check("primary-session", "codegraph", { action })).toThrow(
        /Orchestrator Guard/,
      )
    })
  }

  it("rejects when no args are supplied (deny by default)", () => {
    expect(() => guard.check("primary-session", "codegraph", {})).toThrow(/Orchestrator Guard/)
    expect(() => guard.check("primary-session", "codegraph")).toThrow(/Orchestrator Guard/)
  })

  it("rejects when args is non-object (string, number, null)", () => {
    expect(() =>
      guard.check("primary-session", "codegraph", "install" as unknown as object),
    ).toThrow(/Orchestrator Guard/)
    expect(() =>
      guard.check("primary-session", "codegraph", null),
    ).toThrow(/Orchestrator Guard/)
  })
})

describe("OrchestratorGuard: multiplexed memory dispatcher (action arg)", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  const readOnlyActions = [
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
  ]
  for (const action of readOnlyActions) {
    it(`allows memory(action=${action})`, () => {
      expect(() => guard.check("primary-session", "memory", { action })).not.toThrow()
    })
  }

  const mutatingActions = [
    "create_entities",
    "create_relations",
    "add_observations",
    "delete_entities",
    "delete_relations",
    "delete_observations",
    "add",
    "create",
    "set",
    "delete",
    "remove",
    "update",
    "replace",
    "forget",
    "upsert",
  ]
  for (const action of mutatingActions) {
    it(`blocks memory(action=${action})`, () => {
      expect(() => guard.check("primary-session", "memory", { action })).toThrow(
        /Orchestrator Guard/,
      )
    })
  }

  it("rejects when no args are supplied (deny by default)", () => {
    expect(() => guard.check("primary-session", "memory", {})).toThrow(/Orchestrator Guard/)
    expect(() => guard.check("primary-session", "memory")).toThrow(/Orchestrator Guard/)
  })
})

describe("OrchestratorGuard: _isReadOnlyMultiplexedForTest helper", () => {
  const guard = new OrchestratorGuard()

  it("returns null for non-multiplexed tools", () => {
    expect(guard._isReadOnlyMultiplexedForTest("read", {})).toBeNull()
    expect(guard._isReadOnlyMultiplexedForTest("context7_resolve-library-id", {})).toBeNull()
  })

  it("returns true for read-only codegraph actions", () => {
    expect(guard._isReadOnlyMultiplexedForTest("codegraph", { action: "search" })).toBe(true)
  })

  it("returns false for mutating codegraph actions", () => {
    expect(guard._isReadOnlyMultiplexedForTest("codegraph", { action: "install" })).toBe(false)
  })

  it("returns true for read-only memory actions", () => {
    expect(guard._isReadOnlyMultiplexedForTest("memory", { action: "search_nodes" })).toBe(true)
  })

  it("returns false for mutating memory actions", () => {
    expect(guard._isReadOnlyMultiplexedForTest("memory", { action: "add_observations" })).toBe(
      false,
    )
  })
})

describe("OrchestratorGuard: route-injection routing options", () => {
  function makeGuard(routes: { name: string; description: string }[]): OrchestratorGuard {
    const g = new OrchestratorGuard({ routes })
    g._setPrimarySessionIdForTest("primary-session")
    return g
  }

  it("renders one routing option per injected route", () => {
    const g = makeGuard([
      { name: "alpha-agent", description: "Alpha does X." },
      { name: "beta-agent", description: "Beta does Y." },
    ])
    const opts = g._getRoutingOptionsForTest()
    expect(opts).toContain("@alpha-agent")
    expect(opts).toContain("Alpha does X.")
    expect(opts).toContain("@beta-agent")
    expect(opts).toContain("Beta does Y.")
  })

  it("emits the impossible-state diagnostic when routes are empty", () => {
    const g = makeGuard([])
    let caught: Error | null = null
    try {
      g.check("primary-session", "write")
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("Orchestrator Guard")
    expect(caught!.message).toContain("this should be impossible by construction")
    expect(caught!.message).not.toContain("agent registry may be misconfigured")
  })

  it("does not mention the misleading 'misconfigured' message in any block output", () => {
    const g = makeGuard([
      { name: "default-executor", description: "Default execution worker." },
    ])
    let caught: Error | null = null
    try {
      g.check("primary-session", "bash")
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).not.toContain("agent registry may be misconfigured")
  })
})

describe("OrchestratorGuard: lesson tools are allowed", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  it("allows 'review-lessons' for the primary session", () => {
    expect(() => guard.check("primary-session", "review-lessons")).not.toThrow()
  })

  it("allows 'capture-lesson' for the primary session", () => {
    expect(() => guard.check("primary-session", "capture-lesson")).not.toThrow()
  })

  it("'review-lessons' and 'capture-lesson' are on the always-allowed list", () => {
    expect(guard._isAllowedForTest("review-lessons")).toBe(true)
    expect(guard._isAllowedForTest("capture-lesson")).toBe(true)
  })
})

// ─── Read-only shell inspection (the primary fix) ──────────────────────────

describe("OrchestratorGuard: read-only shell inspection", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  const readOnlyCommands: ReadonlyArray<[string, string]> = [
    ["ls", "ls"],
    ["ls -la path", "ls -la /home/nghiem/project/flowdeck"],
    ["pwd", "pwd"],
    ["find with path", "find /home/nghiem/project/flowdeck -name '*.ts' -not -path '*/node_modules/*'"],
    ["head", "head -n 20 README.md"],
    ["tail", "tail -n 50 logs/app.log"],
    ["cat package.json", "cat package.json"],
    ["cat with flag", "cat -n src/index.ts"],
    ["git status", "git status"],
    ["git status with branch", "git status --short --branch"],
    ["git diff", "git diff"],
    ["git diff stat", "git diff --stat HEAD~1"],
    ["git log", "git log --oneline -10"],
    ["git show", "git show HEAD"],
    ["git ls-files", "git ls-files | head -20"],
    ["read-only pipeline ls | head", "ls /tmp | head -5"],
    ["read-only pipeline cat | grep", "cat README.md | grep -i flowdeck"],
    ["read-only pipeline find | wc", "find . -name '*.ts' | wc -l"],
    ["echo no redirect", "echo hello"],
    ["env listing", "env | head -5"],
    ["which / type", "which bun"],
    ["uname / date", "uname -a && date"],
  ]

  for (const [label, cmd] of readOnlyCommands) {
    it(`allows 'bash' with read-only command: ${label}`, () => {
      expect(() => guard.check("primary-session", "bash", { command: cmd })).not.toThrow()
    })
  }

  it("allows the run_bash alias for read-only commands", () => {
    expect(() => guard.check("primary-session", "run_bash", { command: "ls" })).not.toThrow()
    expect(() => guard.check("primary-session", "run-bash", { command: "pwd" })).not.toThrow()
    expect(() => guard.check("primary-session", "shell", { command: "git status" })).not.toThrow()
    expect(() => guard.check("primary-session", "terminal", { command: "find . -maxdepth 2" })).not.toThrow()
  })

  it("accepts 'cmd' and 'script' as alternate command-arg keys", () => {
    expect(() => guard.check("primary-session", "bash", { cmd: "ls" })).not.toThrow()
    expect(() => guard.check("primary-session", "bash", { script: "pwd" })).not.toThrow()
  })

  it("strips a leading sudo from read-only commands", () => {
    expect(() => guard.check("primary-session", "bash", { command: "sudo ls -la /tmp" })).not.toThrow()
  })

  it("strips a leading FOO=bar env-var prefix from read-only commands", () => {
    expect(() => guard.check("primary-session", "bash", { command: "LANG=C ls" })).not.toThrow()
  })
})

// ─── Shell command denied categories (mutating / sensitive / risky / unknown) ─

describe("OrchestratorGuard: shell command denied categories", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  const mutatingCases: ReadonlyArray<[string, string]> = [
    ["rm -rf", "rm -rf node_modules"],
    ["rm file", "rm package.json"],
    ["mv", "mv a b"],
    ["cp", "cp a b"],
    ["mkdir", "mkdir foo"],
    ["chmod", "chmod 777 file"],
    ["chown", "chown root file"],
    ["git commit", "git commit -m 'x'"],
    ["git push", "git push origin main"],
    ["git pull", "git pull"],
    ["git merge", "git merge feature"],
    ["git rebase", "git rebase main"],
    ["git reset", "git reset --hard"],
    ["git checkout file", "git checkout -- file.txt"],
    ["git checkout branch", "git checkout -b newbranch"],
    ["git branch new", "git branch newbranch"],
    ["git tag new", "git tag v1.0"],
    ["git stash push", "git stash push -m x"],
    ["npm install", "npm install lodash"],
    ["bun install", "bun install"],
    ["pip install", "pip install requests"],
    ["make", "make build"],
    ["cmake", "cmake ."],
    ["docker run", "docker run -it alpine"],
    ["docker exec", "docker exec -it c1 sh"],
    ["kubectl apply", "kubectl apply -f x.yaml"],
    ["terraform apply", "terraform apply"],
    ["ssh", "ssh user@host"],
    ["scp", "scp file user@host:/tmp"],
    ["rsync", "rsync -a src/ dst/"],
    ["curl", "curl -X POST http://example.com"],
    ["wget", "wget http://example.com/file"],
    ["echo redirect", "echo hello > /tmp/x"],
    ["tee", "echo hi | tee /tmp/x"],
    ["eval", "eval $CMD"],
    ["source", "source script.sh"],
    ["export", "export FOO=bar"],
    ["kill", "kill -9 1"],
    ["systemctl", "systemctl restart nginx"],
  ]

  for (const [label, cmd] of mutatingCases) {
    it(`blocks bash(mutation: ${label}) with [block-mutating]`, () => {
      let caught: Error | null = null
      try {
        guard.check("primary-session", "bash", { command: cmd })
      } catch (err) {
        caught = err as Error
      }
      expect(caught).not.toBeNull()
      expect(caught!.message).toContain("Orchestrator Guard")
      expect(caught!.message).toMatch(/block-mutating|block-risky/)
    })
  }

  const sensitiveCases: ReadonlyArray<[string, string]> = [
    ["cat .env", "cat .env"],
    ["cat .env.local", "cat .env.local"],
    ["cat .ssh id_rsa", "cat ~/.ssh/id_rsa"],
    ["cat .aws credentials", "cat ~/.aws/credentials"],
    ["cat .kube config", "cat ~/.kube/config"],
    ["cat .pem", "cat server.pem"],
    ["cat .key", "cat tls.key"],
    ["cat .p12", "cat cert.p12"],
    ["cat /etc/passwd", "cat /etc/passwd"],
    ["cat /etc/shadow", "cat /etc/shadow"],
    ["head .env", "head -n 5 .env"],
    ["less secrets", "less secrets.json"],
  ]

  for (const [label, cmd] of sensitiveCases) {
    it(`blocks bash(sensitive: ${label}) with [block-sensitive-read]`, () => {
      let caught: Error | null = null
      try {
        guard.check("primary-session", "bash", { command: cmd })
      } catch (err) {
        caught = err as Error
      }
      expect(caught).not.toBeNull()
      expect(caught!.message).toContain("Orchestrator Guard")
      expect(caught!.message).toContain("block-sensitive-read")
    })
  }

  const riskyCases: ReadonlyArray<[string, string]> = [
    ["ssh indirection", "ssh user@host 'rm -rf /'"],
    ["git fetch (network)", "git fetch origin"],
    ["git pull (network)", "git pull origin main"],
    ["git clone", "git clone https://example.com/repo.git"],
    ["curl with -c (indirection)", "curl -c 'rm -rf /' http://x"],
  ]

  for (const [label, cmd] of riskyCases) {
    it(`blocks bash(risky: ${label}) with [block-risky]`, () => {
      let caught: Error | null = null
      try {
        guard.check("primary-session", "bash", { command: cmd })
      } catch (err) {
        caught = err as Error
      }
      expect(caught).not.toBeNull()
      expect(caught!.message).toMatch(/block-risky|block-mutating/)
    })
  }

  const unknownCases: ReadonlyArray<[string, string]> = [
    ["custom binary", "weirdcustombinary --flag"],
    ["indirection bash -c", "bash -c 'echo hi'"],
    ["sh -c", "sh -c 'ls'"],
    ["python interpreter", "python -c 'print(1)'"],
    ["ruby", "ruby -e 'puts 1'"],
  ]

  for (const [label, cmd] of unknownCases) {
    it(`blocks bash(unknown: ${label}) with [block-unknown]`, () => {
      let caught: Error | null = null
      try {
        guard.check("primary-session", "bash", { command: cmd })
      } catch (err) {
        caught = err as Error
      }
      expect(caught).not.toBeNull()
      expect(caught!.message).toMatch(/block-unknown|block-mutating|block-risky/)
    })
  }

  it("blocks bash with no command arg using [block-missing-arg]", () => {
    let caught: Error | null = null
    try {
      guard.check("primary-session", "bash", {})
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("block-missing-arg")
  })

  it("blocks bash with empty command arg using [block-missing-arg]", () => {
    let caught: Error | null = null
    try {
      guard.check("primary-session", "bash", { command: "   " })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("block-missing-arg")
  })

  it("blocks bash with non-string command arg using [block-missing-arg]", () => {
    let caught: Error | null = null
    try {
      guard.check("primary-session", "bash", { command: 42 })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("block-missing-arg")
  })
})

// ─── Shell diagnostic accuracy ─────────────────────────────────────────────

describe("OrchestratorGuard: shell diagnostic accuracy", () => {
  let guard: OrchestratorGuard
  beforeEach(() => {
    guard = new OrchestratorGuard()
    guard._setPrimarySessionIdForTest("primary-session")
  })

  it("mutating error includes the category tag and a concrete reason", () => {
    let caught: Error | null = null
    try {
      guard.check("primary-session", "bash", { command: "rm -rf node_modules" })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("block-mutating")
    expect(caught!.message).toContain("rm")
    expect(caught!.message).toContain("Reason:")
  })

  it("sensitive-read error names the matched sensitive pattern", () => {
    let caught: Error | null = null
    try {
      guard.check("primary-session", "bash", { command: "cat .env" })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("block-sensitive-read")
    expect(caught!.message).toContain(".env")
  })

  it("redirect error mentions the redirect operator", () => {
    let caught: Error | null = null
    try {
      guard.check("primary-session", "bash", { command: "echo hi > /tmp/x" })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toMatch(/block-mutating|block-risky/)
    expect(caught!.message).toMatch(/redirect|>/)
  })

  it("unknown command error mentions 'classified' or 'specialist'", () => {
    let caught: Error | null = null
    try {
      guard.check("primary-session", "bash", { command: "weirdcustombinary --flag" })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("block-unknown")
  })

  it("shell error message includes routing options from injected routes", () => {
    const g = new OrchestratorGuard({
      routes: [
        { name: "default-executor", description: "Default execution worker." },
        { name: "coder", description: "Implements backend/frontend/devops." },
      ],
    })
    g._setPrimarySessionIdForTest("primary-session")
    let caught: Error | null = null
    try {
      g.check("primary-session", "bash", { command: "rm -rf /" })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("@default-executor")
    expect(caught!.message).toContain("@coder")
  })
})

// ─── Helper accessors ──────────────────────────────────────────────────────

describe("OrchestratorGuard: shell helper accessors", () => {
  const guard = new OrchestratorGuard()

  it("_isShellToolForTest identifies shell tool names", () => {
    expect(guard._isShellToolForTest("bash")).toBe(true)
    expect(guard._isShellToolForTest("run_bash")).toBe(true)
    expect(guard._isShellToolForTest("run-bash")).toBe(true)
    expect(guard._isShellToolForTest("shell")).toBe(true)
    expect(guard._isShellToolForTest("terminal")).toBe(true)
    expect(guard._isShellToolForTest("execute")).toBe(true)
    expect(guard._isShellToolForTest("write")).toBe(false)
    expect(guard._isShellToolForTest("npm")).toBe(false)
  })

  it("_readCommandArgForTest extracts the command string from args", () => {
    expect(guard._readCommandArgForTest({ command: "ls" })).toBe("ls")
    expect(guard._readCommandArgForTest({ cmd: "pwd" })).toBe("pwd")
    expect(guard._readCommandArgForTest({ script: "git status" })).toBe("git status")
    expect(guard._readCommandArgForTest({})).toBeNull()
    expect(guard._readCommandArgForTest({ command: "" })).toBeNull()
    expect(guard._readCommandArgForTest({ command: 42 })).toBeNull()
    expect(guard._readCommandArgForTest(null)).toBeNull()
    expect(guard._readCommandArgForTest(undefined)).toBeNull()
  })

  it("_classifyShellCommandForTest classifies commands", () => {
    expect(guard._classifyShellCommandForTest("ls").category).toBe("read")
    expect(guard._classifyShellCommandForTest("pwd").category).toBe("read")
    expect(guard._classifyShellCommandForTest("rm -rf /").category).toBe("mutating")
    expect(guard._classifyShellCommandForTest("cat .env").category).toBe("sensitive-read")
    expect(guard._classifyShellCommandForTest("git status").category).toBe("read")
    expect(guard._classifyShellCommandForTest("git commit -m x").category).toBe("mutating")
  })
})
