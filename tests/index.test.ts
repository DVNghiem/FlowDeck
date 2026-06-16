/**
 * Plugin Entry Integration Tests
 *
 * Covers:
 * - The plugin factory returns the expected shape.
 * - ContextIngressService is instantiated and invoked on command.execute.before.
 * - Token budget and trivial-chat flag are logged via appLog.
 * - command.execute.before remains advisory (does not throw).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import plugin from "@/index"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-index-test-"))
}

function createMockClient() {
  return {
    app: {
      log: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function writeState(dir: string, content: string): void {
  const planningDir = join(dir, ".planning")
  mkdirSync(planningDir, { recursive: true })
  writeFileSync(join(planningDir, "STATE.md"), content, "utf-8")
}

interface TestHooks {
  name: string
  agent?: Record<string, unknown>
  mcp?: Record<string, unknown>
  tool?: Record<string, unknown>
  config?: (cfg: any) => Promise<void>
  "command.execute.before"?: (input: any, output: any) => Promise<void>
  "tool.execute.before"?: (input: any, output: any) => Promise<void>
  event?: (input: { event: any }) => Promise<void>
}

describe("plugin entry", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    writeState(dir, "---\nphase: 1\n---\n# State")
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
    expect(instance["command.execute.before"]).toBeDefined()
  })

  it("logs token budget and trivial-chat flag on command.execute.before", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "hello", sessionID: "sess-1", arguments: "" },
      { parts: [] },
    )

    const logCalls = (client.app.log as any).mock.calls
    const contextLog = logCalls.find((call: any) =>
      call[0]?.body?.message?.includes("[context-ingress]"),
    )
    expect(contextLog).toBeDefined()
    expect(contextLog[0].body.message).toMatch(/trivial=true/)
    expect(contextLog[0].body.message).toMatch(/tokens=\d+\/\d+/)
  })

  it("assembles heavy-task context when command is non-trivial", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "implement auth service", sessionID: "sess-2", arguments: "" },
      { parts: [] },
    )

    const logCalls = (client.app.log as any).mock.calls
    const contextLog = logCalls.find((call: any) =>
      call[0]?.body?.message?.includes("[context-ingress]"),
    )
    expect(contextLog).toBeDefined()
    expect(contextLog[0].body.message).toMatch(/trivial=false/)
  })

  it("does not throw when context assembly fails", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    // Empty sessionID is an edge case; command.execute.before should remain
    // advisory and complete without throwing.
    await instance["command.execute.before"]?.(
      { command: "test", sessionID: "", arguments: "" },
      { parts: [] },
    )

    // If we reach this point, the hook did not throw.
    expect(true).toBe(true)
  })

  it("logs classification, readiness, tool family, and planning paths", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "implement auth service", sessionID: "sess-3", arguments: "" },
      { parts: [] },
    )

    const logCalls = (client.app.log as any).mock.calls
    const contextLog = logCalls.find((call: any) =>
      call[0]?.body?.message?.includes("[context-ingress]"),
    )
    expect(contextLog).toBeDefined()
    const msg: string = contextLog[0].body.message
    // The new log line should include the workflow class, discuss gate, signals,
    // tool family, token optimization, readiness, and plan path.
    expect(msg).toMatch(/class=/)
    expect(msg).toMatch(/discuss=/)
    expect(msg).toMatch(/signals=/)
    expect(msg).toMatch(/tool=/)
    expect(msg).toMatch(/token_opt=/)
    expect(msg).toMatch(/readiness=/)
    expect(msg).toMatch(/phase=|\.planning\/phases\/phase-/)
  })

  it("logs trivial chat with skipped context", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "hello", sessionID: "sess-4", arguments: "" },
      { parts: [] },
    )

    const logCalls = (client.app.log as any).mock.calls
    const contextLog = logCalls.find((call: any) =>
      call[0]?.body?.message?.includes("[context-ingress]"),
    )
    expect(contextLog).toBeDefined()
    const msg: string = contextLog[0].body.message
    expect(msg).toMatch(/trivial=true/)
    expect(msg).toMatch(/docs=skip/)
    expect(msg).toMatch(/events=skip/)
  })

  // ─── Routing decision persisted + hint propagated through tool.execute ──

  it("persists a routing decision entry to .codebase/DECISIONS.jsonl", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "implement auth service", sessionID: "sess-route-1", arguments: "" },
      { parts: [] },
    )

    const decisionsPath = join(dir, ".codebase", "DECISIONS.jsonl")
    expect(existsSync(decisionsPath)).toBe(true)
    const content = readFileSync(decisionsPath, "utf-8")
    const entries = content
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    expect(entries.length).toBeGreaterThan(0)
    const route = entries.find((e: any) => e.id?.startsWith("route-"))
    expect(route).toBeDefined()
    expect(route.session_id).toBe("sess-route-1")
    expect(route.agent).toBe("context-ingress")
    expect(route.rationale).toMatch(/Routed command 'implement auth service'/)
    expect(Array.isArray(route.evidence)).toBe(true)
    expect(route.evidence.some((s: string) => s.startsWith("class="))).toBe(true)
  })

  it("attaches the flowdeck routing hint to toolInput.metadata on tool.execute.before", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    // config() initializes eventLog/loopDetector so the event hook doesn't crash
    await instance.config?.({})

    // Set up the primary session so the guard is active
    await instance.event?.({ event: { type: "session.created", properties: { info: { id: "sess-hint" } } } })
    await instance["command.execute.before"]?.(
      { command: "implement the auth service", sessionID: "sess-hint", arguments: "" },
      { parts: [] },
    )

    const toolInput: any = { tool: "read", sessionID: "sess-hint", args: { filePath: "x.ts" } }
    await instance["tool.execute.before"]?.(toolInput, { args: { filePath: "x.ts" } })

    expect(toolInput.metadata).toBeDefined()
    expect(toolInput.metadata.flowdeckRouting).toBeDefined()
    const hint = toolInput.metadata.flowdeckRouting
    expect(hint.runId).toBe("sess-hint")
    expect(typeof hint.workflowClass).toBe("string")
    expect(typeof hint.isTrivialChat).toBe("boolean")
    expect(typeof hint.tokenOptimizationActive).toBe("boolean")
    expect(hint.readiness).toBeDefined()
    expect(typeof hint.readiness.statePresent).toBe("boolean")
    expect(typeof hint.readiness.codegraphReady).toBe("boolean")
  })

  it("persists the routing decision even when description is trivial", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "hello there", sessionID: "sess-trivial", arguments: "" },
      { parts: [] },
    )

    const decisionsPath = join(dir, ".codebase", "DECISIONS.jsonl")
    expect(existsSync(decisionsPath)).toBe(true)
    const content = readFileSync(decisionsPath, "utf-8")
    const entries = content
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    const route = entries.find((e: any) => e.id?.startsWith("route-"))
    expect(route).toBeDefined()
    expect(route.risk_level).toBe("low")
  })
})
