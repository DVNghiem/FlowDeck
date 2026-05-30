import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  eventLogBeforeHook,
  eventLogAfterHook,
  eventLogSessionHook,
  cleanupStaleToolStartTimes,
  setStaleThresholdMs,
} from "@/hooks/event-log-hook"
import { getCurrentAgent, setCurrentAgent } from "@/services/event-logger"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-event-hook-test-"))
}

function readEvents(dir: string): Array<Record<string, unknown>> {
  const path = join(dir, ".opencode", "flowdeck-events.jsonl")
  if (!existsSync(path)) return []
  const content = readFileSync(path, "utf-8")
  return content
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

describe("eventLogBeforeHook", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    setCurrentAgent(null)
    setStaleThresholdMs(5 * 60 * 1000)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("logs tool.before event", async () => {
    setCurrentAgent("backend-coder")
    const ctx = { directory: dir }
    const toolInput = { tool: "write", sessionID: "sess-1" }
    const toolOutput = { args: { filePath: "src/index.ts" } }

    await eventLogBeforeHook(ctx, toolInput, toolOutput)
    const events = readEvents(dir)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("tool.before")
    expect(events[0].agent).toBe("backend-coder")
    expect(events[0].tool).toBe("write")
    expect(events[0].session_id).toBe("sess-1")
    expect((events[0].args as any).filePath).toBe("src/index.ts")
  })

  it("sanitizes args before logging", async () => {
    setCurrentAgent("backend-coder")
    const ctx = { directory: dir }
    const toolInput = { tool: "write", sessionID: "sess-1" }
    const toolOutput = { args: { filePath: "src/index.ts", content: "a".repeat(500) } }

    await eventLogBeforeHook(ctx, toolInput, toolOutput)
    const events = readEvents(dir)
    expect((events[0].args as any).content).toContain("truncated")
  })

  it("falls back to toolInput.args when toolOutput.args is missing", async () => {
    setCurrentAgent("backend-coder")
    const ctx = { directory: dir }
    const toolInput = { tool: "read", sessionID: "sess-2", args: { filePath: "src/main.ts" } }
    const toolOutput = {}

    await eventLogBeforeHook(ctx, toolInput, toolOutput)
    const events = readEvents(dir)
    expect((events[0].args as any).filePath).toBe("src/main.ts")
  })
})

describe("eventLogAfterHook", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    setCurrentAgent(null)
    setStaleThresholdMs(5 * 60 * 1000)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("logs tool.after event with duration", async () => {
    setCurrentAgent("backend-coder")
    const ctx = { directory: dir }
    const toolInput = { tool: "write", sessionID: "sess-1" }
    const toolOutput = { args: { filePath: "src/index.ts" } }

    await eventLogBeforeHook(ctx, toolInput, toolOutput)
    await new Promise((r) => setTimeout(r, 5))
    await eventLogAfterHook(ctx, toolInput, toolOutput)

    const events = readEvents(dir)
    expect(events).toHaveLength(2)
    const afterEvent = events[1]
    expect(afterEvent.type).toBe("tool.after")
    expect(afterEvent.agent).toBe("backend-coder")
    expect(afterEvent.tool).toBe("write")
    expect(afterEvent.status).toBe("success")
    expect(typeof afterEvent.duration_ms).toBe("number")
    expect(afterEvent.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it("logs error status when toolOutput has error", async () => {
    setCurrentAgent("backend-coder")
    const ctx = { directory: dir }
    const toolInput = { tool: "write", sessionID: "sess-1" }
    const toolOutput = { args: { filePath: "src/index.ts" }, error: "Permission denied" }

    await eventLogBeforeHook(ctx, toolInput, toolOutput)
    await eventLogAfterHook(ctx, toolInput, toolOutput)

    const events = readEvents(dir)
    const afterEvent = events[1]
    expect(afterEvent.status).toBe("error")
    expect(afterEvent.error).toBe("Permission denied")
  })

  it("logs blocked status when toolOutput status is blocked", async () => {
    setCurrentAgent("backend-coder")
    const ctx = { directory: dir }
    const toolInput = { tool: "write", sessionID: "sess-1" }
    const toolOutput = { args: { filePath: "src/index.ts" }, status: "blocked" }

    await eventLogBeforeHook(ctx, toolInput, toolOutput)
    await eventLogAfterHook(ctx, toolInput, toolOutput)

    const events = readEvents(dir)
    expect(events[1].status).toBe("blocked")
  })

  it("tracks duration independently for concurrent tools in same session", async () => {
    setCurrentAgent("backend-coder")
    const ctx = { directory: dir }
    const toolInput1 = { tool: "write", sessionID: "sess-1" }
    const toolOutput1 = { args: { filePath: "src/a.ts" } }
    const toolInput2 = { tool: "read", sessionID: "sess-1" }
    const toolOutput2 = { args: { filePath: "src/b.ts" } }

    await eventLogBeforeHook(ctx, toolInput1, toolOutput1)
    await new Promise((r) => setTimeout(r, 10))
    await eventLogBeforeHook(ctx, toolInput2, toolOutput2)
    await new Promise((r) => setTimeout(r, 10))
    await eventLogAfterHook(ctx, toolInput2, toolOutput2)
    await new Promise((r) => setTimeout(r, 10))
    await eventLogAfterHook(ctx, toolInput1, toolOutput1)

    const events = readEvents(dir)
    const afterEvents = events.filter((e: any) => e.type === "tool.after")
    expect(afterEvents).toHaveLength(2)
    // Each after event should have a duration > 10ms (not 0 or undefined)
    expect(afterEvents[0].duration_ms).toBeGreaterThanOrEqual(10)
    expect(afterEvents[1].duration_ms).toBeGreaterThanOrEqual(10)
  })

  it("cleans up stale tool start times", async () => {
    setStaleThresholdMs(40) // Short threshold for testing
    try {
      setCurrentAgent("backend-coder")
      const ctx = { directory: dir }
      const toolInput = { tool: "write", sessionID: "sess-stale" }
      const toolOutput = { args: { filePath: "src/x.ts" } }

      await eventLogBeforeHook(ctx, toolInput, toolOutput)
      // AfterHook is intentionally NOT called
      await new Promise((r) => setTimeout(r, 50))

      // Trigger cleanup
      cleanupStaleToolStartTimes()

      // Calling after hook now should not find the start time
      await eventLogAfterHook(ctx, toolInput, toolOutput)

      const events = readEvents(dir)
      const afterEvent = events.find((e: any) => e.type === "tool.after")
      expect(afterEvent?.duration_ms).toBeUndefined()
    } finally {
      setStaleThresholdMs(5 * 60 * 1000) // Restore production value
    }
  })
})

describe("eventLogSessionHook", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    setCurrentAgent(null)
    setStaleThresholdMs(5 * 60 * 1000)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("tracks agent changes on session.created with parentID", async () => {
    const ctx = { directory: dir }
    const event = {
      type: "session.created",
      properties: {
        parentID: "parent-sess-1",
        title: "backend-coder-delegate",
      },
    }

    await eventLogSessionHook(ctx, event)
    expect(getCurrentAgent()).toBe("backend-coder")
  })

  it("extracts agent from properties.agent if available", async () => {
    const ctx = { directory: dir }
    const event = {
      type: "session.created",
      properties: {
        parentID: "parent-sess-1",
        agent: "researcher",
        title: "other-delegate",
      },
    }

    await eventLogSessionHook(ctx, event)
    expect(getCurrentAgent()).toBe("researcher")
  })

  it("does not change agent when session.created has no parentID", async () => {
    setCurrentAgent("orchestrator")
    const ctx = { directory: dir }
    const event = {
      type: "session.created",
      properties: { id: "sess-1" },
    }

    await eventLogSessionHook(ctx, event)
    expect(getCurrentAgent()).toBe("orchestrator")
  })

  it("logs session.created event", async () => {
    const ctx = { directory: dir }
    const event = {
      type: "session.created",
      properties: { id: "sess-1" },
    }

    await eventLogSessionHook(ctx, event)
    const events = readEvents(dir)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("session.created")
    expect(events[0].session_id).toBe("sess-1")
  })

  it("logs session.idle event", async () => {
    const ctx = { directory: dir }
    const event = {
      type: "session.idle",
      properties: { id: "sess-1" },
    }

    await eventLogSessionHook(ctx, event)
    const events = readEvents(dir)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("session.idle")
  })

  it("logs session.error event", async () => {
    const ctx = { directory: dir }
    const event = {
      type: "session.error",
      properties: { error: { message: "Something failed" } },
    }

    await eventLogSessionHook(ctx, event)
    const events = readEvents(dir)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("session.error")
    expect(events[0].error).toBe("Something failed")
  })

  it("resets current agent on session.idle for delegated session", async () => {
    setCurrentAgent("orchestrator")
    const ctx = { directory: dir }

    // Simulate delegation
    const createdEvent = {
      type: "session.created",
      properties: { parentID: "parent-sess", title: "backend-coder-delegate" },
    }
    await eventLogSessionHook(ctx, createdEvent)
    expect(getCurrentAgent()).toBe("backend-coder")

    // Simulate idle of delegated session
    const idleEvent = {
      type: "session.idle",
      properties: { id: "child-sess", parentID: "parent-sess" },
    }
    await eventLogSessionHook(ctx, idleEvent)
    expect(getCurrentAgent()).toBeNull()
  })
})
