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
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
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
    "bash",
    "run_bash",
    "execute",
    "run_command",
    "terminal",
    "shell",
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
    expect(() => guard.check("primary-session", "write")).toThrow(/@default-executor/)
    expect(() => guard.check("primary-session", "write")).toThrow(/@backend-coder/)
  })

  it("error message lists registered agents dynamically", () => {
    expect(() => guard.check("primary-session", "write")).toThrow(/@planner/)
    expect(() => guard.check("primary-session", "write")).toThrow(/@tester/)
    expect(() => guard.check("primary-session", "write")).toThrow(/@reviewer/)
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
    "decision-trace",
    "policy-engine",
    "reflect",
    "codegraph-search",
    "codegraph-node",
    "codegraph-explore",
    "load-rules",
    "list-rules",
    "council",
    "failure-replay",
    "task",
    "background-agent",
    "check-background-agent",
    "list-background-agents",
    "tmux-watch",
    "tmux-dashboard",
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
      "decision-trace",
      "policy-engine",
      "reflect",
      "load-rules",
      "list-rules",
      "council",
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

  it("rejects shell/exec/code-exec tools", () => {
    const blocked = [
      "bash",
      "run_bash",
      "run-bash",
      "execute",
      "shell",
      "terminal",
      "python",
      "run_python",
      "npm",
      "bun",
      "docker",
      "kubectl",
      "terraform",
    ]
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
