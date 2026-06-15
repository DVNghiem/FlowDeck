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
    "codegraph",
    "codegraph-search",
    "codegraph-node",
    "codegraph-explore",
    "load-rules",
    "list-rules",
    "council",
    "hash-edit",
    "failure-replay",
    "task",
    "background-agent",
    "check-background-agent",
    "list-background-agents",
  ]

  allowedTools.forEach((tool) => {
    it(`allows '${tool}' for primary session`, () => {
      expect(() => guard.check("primary-session", tool)).not.toThrow()
    })
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
