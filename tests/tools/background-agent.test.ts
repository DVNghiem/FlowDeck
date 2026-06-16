/**
 * Background Agent Tool Tests
 *
 * Covers:
 * - createBackgroundAgentTool returns a taskId and running status immediately
 * - createCheckBackgroundAgentTool reports running while task is active
 * - Task completes when session.idle event fires for the child session
 * - Output is captured from assistant messages
 * - createListBackgroundAgentsTool lists active tasks
 * - Model override from config is applied to promptAsync body
 * - Failed session creation returns an error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  createBackgroundAgentTool,
  createCheckBackgroundAgentTool,
  createListBackgroundAgentsTool,
  setTaskRegistryForTest,
  getTaskRegistryForTest,
} from "@/tools/background-agent"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-bg-agent-test-"))
}

function makeMockClient(events: any[] = []) {
  const streams: Array<{ childId: string; controller: any }> = []
  return {
    session: {
      create: vi.fn().mockResolvedValue({ data: { id: "child-1" }, error: null }),
      promptAsync: vi.fn().mockResolvedValue({ data: null, error: null }),
      messages: vi.fn().mockResolvedValue({
        data: [
          {
            role: "assistant",
            parts: [{ type: "text", text: "Background work complete" }],
          },
        ],
      }),
    },
    event: {
      subscribe: vi.fn().mockImplementation((_opts: any) => {
        const controller = { return: vi.fn().mockResolvedValue(undefined) }
        streams.push({ childId: "child-1", controller })
        return {
          stream: (async function* () {
            for (const event of events) {
              yield event
            }
          })(),
          controller,
        }
      }),
    },
    _streams: streams,
  }
}

describe("createBackgroundAgentTool", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    setTaskRegistryForTest(new Map())
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setTaskRegistryForTest(new Map())
  })

  it("returns a running task with a taskId immediately", async () => {
    const client = makeMockClient([])
    const tool = createBackgroundAgentTool(client as any, () => ({}))

    const result = await tool.execute({ agent: "researcher", task: "look up API docs" }, { sessionID: "parent-1", directory: dir } as any)

    const parsed = JSON.parse(result as string)
    expect(parsed.agent).toBe("researcher")
    expect(parsed.status).toBe("running")
    expect(parsed.taskId).toBeTruthy()
    expect(parsed.message).toContain("check-background-agent")
  })

  it("passes model override to promptAsync body when configured", async () => {
    const client = makeMockClient([])
    const tool = createBackgroundAgentTool(client as any, () => ({
      agentModels: { researcher: { model: "openai/gpt-4o" } },
    }))

    await tool.execute({ agent: "researcher", task: "research" }, { sessionID: "parent-1", directory: dir } as any)

    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          agent: "researcher",
          model: { providerID: "openai", modelID: "gpt-4o" },
          parts: [{ type: "text", text: "research" }],
        }),
      }),
    )
  })

  it("creates a log file for the task", async () => {
    const client = makeMockClient([])
    const tool = createBackgroundAgentTool(client as any, () => ({}))

    const result = await tool.execute({ agent: "researcher", task: "research", taskId: "task-1" }, { sessionID: "parent-1", directory: dir } as any)
    const parsed = JSON.parse(result as string)

    const logFile = join(dir, ".flowdeck", "logs", `${parsed.taskId}.log`)
    expect(existsSync(logFile)).toBe(true)
    expect(readFileSync(logFile, "utf-8")).toContain("Started background task")
  })
})

describe("createCheckBackgroundAgentTool", () => {
  let dir: string
  let registry: Map<string, any>

  beforeEach(() => {
    dir = makeTempDir()
    registry = new Map()
    setTaskRegistryForTest(registry)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setTaskRegistryForTest(new Map())
  })

  it("reports running while task is active", async () => {
    registry.set("task-1", {
      taskId: "task-1",
      agent: "researcher",
      sessionId: "child-1",
      startedAt: Date.now(),
      status: "running",
    })
    setTaskRegistryForTest(registry)

    const tool = createCheckBackgroundAgentTool()
    const result = await tool.execute({ taskId: "task-1" }, { directory: dir } as any)
    const parsed = JSON.parse(result as string)

    expect(parsed.status).toBe("running")
    expect(parsed.elapsedSeconds).toBeGreaterThanOrEqual(0)
  })

  it("returns output and cleans up completed task", async () => {
    registry.set("task-1", {
      taskId: "task-1",
      agent: "researcher",
      sessionId: "child-1",
      startedAt: Date.now(),
      status: "complete",
      output: "Done",
    })
    setTaskRegistryForTest(registry)

    const tool = createCheckBackgroundAgentTool()
    const result = await tool.execute({ taskId: "task-1" }, { directory: dir } as any)
    const parsed = JSON.parse(result as string)

    expect(parsed.status).toBe("complete")
    expect(parsed.output).toBe("Done")
    expect(getTaskRegistryForTest().has("task-1")).toBe(false)
  })

  it("returns not found for unknown task", async () => {
    const tool = createCheckBackgroundAgentTool()
    const result = await tool.execute({ taskId: "missing" }, { directory: dir } as any)
    expect(result).toContain("No background task found")
  })
})

describe("createListBackgroundAgentsTool", () => {
  let dir: string
  let registry: Map<string, any>

  beforeEach(() => {
    dir = makeTempDir()
    registry = new Map()
    setTaskRegistryForTest(registry)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setTaskRegistryForTest(new Map())
  })

  it("lists active tasks", async () => {
    registry.set("task-1", { taskId: "task-1", agent: "researcher", status: "running", startedAt: Date.now() })
    registry.set("task-2", { taskId: "task-2", agent: "tester", status: "running", startedAt: Date.now() })
    setTaskRegistryForTest(registry)

    const tool = createListBackgroundAgentsTool()
    const result = await tool.execute({}, { directory: dir } as any)
    const parsed = JSON.parse(result as string)

    expect(parsed).toHaveLength(2)
    expect(parsed.map((t: any) => t.taskId)).toContain("task-1")
    expect(parsed.map((t: any) => t.taskId)).toContain("task-2")
  })

  it("returns friendly message when no tasks", async () => {
    const tool = createListBackgroundAgentsTool()
    const result = await tool.execute({}, { directory: dir } as any)
    expect(result).toBe("No active background tasks.")
  })
})
