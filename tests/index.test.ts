/**
 * Plugin Entry Integration Tests
 *
 * Covers:
 * - The plugin factory returns the expected shape.
 * - command.execute.before classifies commands and sets a routing hint.
 * - The routing hint is attached to toolInput.metadata on tool.execute.before.
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
  "command.execute.before"?: (input: any, output: any) => Promise<void>
  "tool.execute.before"?: (input: any, output: any) => Promise<void>
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
    expect(instance["command.execute.before"]).toBeDefined()
  })

  it("logs routing classification on command.execute.before", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "hello", sessionID: "sess-1", arguments: "" },
      { parts: [] },
    )

    const logCalls = (client.app.log as any).mock.calls
    const routingLog = logCalls.find((call: any) =>
      call[0]?.body?.message?.includes("[routing]"),
    )
    expect(routingLog).toBeDefined()
    expect(routingLog[0].body.message).toMatch(/workflow=quick/)
    expect(routingLog[0].body.message).toMatch(/trivial=true/)
  })

  it("classifies implementation commands as standard workflow", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "implement auth service", sessionID: "sess-2", arguments: "" },
      { parts: [] },
    )

    const logCalls = (client.app.log as any).mock.calls
    const routingLog = logCalls.find((call: any) =>
      call[0]?.body?.message?.includes("[routing]"),
    )
    expect(routingLog).toBeDefined()
    expect(routingLog[0].body.message).toMatch(/workflow=standard/)
    expect(routingLog[0].body.message).toMatch(/trivial=false/)
  })

  it("does not throw when command.execute.before receives empty input", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance["command.execute.before"]?.(
      { command: "test", sessionID: "", arguments: "" },
      { parts: [] },
    )

    expect(true).toBe(true)
  })

  it("attaches the flowdeck routing hint to toolInput.metadata on tool.execute.before", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    await instance.config?.({})
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

  it("does not register removed tools", async () => {
    const client = createMockClient()
    const instance = await loadPlugin(client)

    const toolNames = Object.keys(instance.tool ?? {})
    expect(toolNames).not.toContain("delegate")
    expect(toolNames).not.toContain("run-pipeline")
    expect(toolNames).not.toContain("council")
    expect(toolNames).not.toContain("tmux-watch")
    expect(toolNames).not.toContain("tmux-dashboard")
  })
})
