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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs"
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
})
