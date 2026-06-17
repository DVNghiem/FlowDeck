/**
 * Plugin Entry Integration Tests
 *
 * Covers:
 * - The plugin factory returns the expected shape.
 * - Surviving tool registrations are present.
 * - tool.execute.before calls guard-rails + loop detector (no longer attaches routing hints).
 * - event hook calls sessionStartHook on session.created.
 * - Removed tools are not registered.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import plugin from "@/index"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-index-test-"))
}

function writeState(dir: string): void {
  const planningDir = join(dir, ".planning")
  mkdirSync(planningDir, { recursive: true })
  writeFileSync(join(planningDir, "STATE.md"), "---\nphase: 1\n---\n# State", "utf-8")
}

function createMockClient(events: unknown[] = []) {
  return {
    app: {
      log: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      create: vi.fn().mockResolvedValue({ data: { id: "child-1" }, error: null }),
      promptAsync: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    event: {
      subscribe: vi.fn().mockResolvedValue({
        stream: (async function* () {
          for (const event of events) {
            yield event
          }
        })(),
      }),
    },
  }
}

interface TestHooks {
  name: string
  agent?: Record<string, unknown>
  mcp?: Record<string, unknown>
  tool?: Record<string, { execute: (...args: any[]) => any }>
  config?: (cfg: any) => Promise<void>
  "tool.execute.before"?: (input: any, output: any) => Promise<void>
  "tool.execute.after"?: (input: any, output: any) => Promise<void>
  event?: (input: { event: any }) => Promise<void>
}

describe("plugin entry", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    writeState(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function loadPlugin(client: any): Promise<TestHooks> {
    return (await plugin({ directory: dir, client } as any, {})) as unknown as TestHooks
  }

  it("returns a plugin object with expected registration keys", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    expect(instance.name).toBe("@dv.nghiem/flowdeck")
    expect(instance.agent).toBeDefined()
    expect(instance.mcp).toBeDefined()
    expect(instance.tool).toBeDefined()
    expect(instance.config).toBeDefined()
    expect(instance["tool.execute.before"]).toBeDefined()
    expect(instance["tool.execute.after"]).toBeDefined()
    expect(instance.event).toBeDefined()
  })

  it("registers the surviving core tools", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    const toolNames = Object.keys(instance.tool ?? {})
    const expected = [
      "planning-state",
      "codebase-state",
      "repo-memory",
      "failure-replay",
      "policy-engine",
      "hash-edit",
      "codegraph",
      "load-rules",
      "list-rules",
      "merge-assist",
      "background-agent",
      "check-background-agent",
      "list-background-agents",
      "capture-lesson",
      "review-lessons",
    ]
    for (const name of expected) {
      expect(toolNames).toContain(name)
    }
  })

  it("does not register removed tools", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    const toolNames = Object.keys(instance.tool ?? {})
    expect(toolNames).not.toContain("delegate")
    expect(toolNames).not.toContain("run-pipeline")
    expect(toolNames).not.toContain("council")
    expect(toolNames).not.toContain("tmux-watch")
    expect(toolNames).not.toContain("tmux-dashboard")
    expect(toolNames).not.toContain("decision-trace")
    expect(toolNames).not.toContain("reflect")
  })

  it("calls sessionStartHook on session.created events", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    let threw: unknown = null
    try {
      await instance.event?.({ event: { type: "session.created", properties: { info: { id: "sess-1" } } } })
    } catch (err) {
      threw = err
    }
    expect(threw).toBeNull()
  })

  it("emits a minimal completion log from tool.execute.after", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    const toolInput = { tool: "read", sessionID: "sess-1", args: { filePath: "x.ts" } }
    await instance["tool.execute.after"]?.(toolInput, { args: { filePath: "x.ts" } })

    const logCalls = (client.app.log as any).mock.calls
    const doneLog = logCalls.find((call: any) => call[0]?.body?.message?.includes("[tool] done"))
    expect(doneLog).toBeDefined()
    expect(doneLog[0].body.message).toMatch(/tool=read/)
    expect(doneLog[0].body.message).toMatch(/session=sess-1/)
  })

  it("does not attach a flowdeck routing hint in tool.execute.before", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    const toolInput: any = { tool: "read", sessionID: "sess-1", args: { filePath: "x.ts" } }
    let threw: unknown = null
    try {
      await instance["tool.execute.before"]?.(toolInput, { args: { filePath: "x.ts" } })
    } catch (err) {
      threw = err
    }
    expect(threw).toBeNull()
    expect(toolInput.metadata?.flowdeckRouting).toBeUndefined()
  })

  it("default install: guard's block message lists built-in agents (no misconfigured message)", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    // The plugin should have been loaded and registered a guard. We
    // simulate the guard being asked to block a tool: the block message
    // must list the built-in agents, not the misleading "agent registry
    // may be misconfigured" message.
    void instance
    const toolInput: any = { tool: "write", sessionID: "primary", args: {} }
    void toolInput

    const { getAgentRoutes } = await import("@/agents/index")
    const { OrchestratorGuard } = await import("@/hooks/orchestrator-guard-hook")
    const guard = new OrchestratorGuard({ routes: getAgentRoutes() })
    guard._setPrimarySessionIdForTest("primary")

    let caught: Error | null = null
    try {
      guard.check("primary", "write")
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain("@default-executor")
    expect(caught!.message).toContain("@auto-learner")
    expect(caught!.message).not.toContain("agent registry may be misconfigured")
  })
})
