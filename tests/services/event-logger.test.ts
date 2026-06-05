import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs"
import * as fsModule from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  logEvent,
  formatEventForStderr,
  getCurrentAgent,
  setCurrentAgent,
  sanitizeArgs,
  isEventLogHealthy,
  getLastPersistenceError,
  resetEventLogHealth,
  type ToolEvent,
} from "@/services/event-logger"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-event-logger-test-"))
}

describe("logEvent", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("writes valid JSON to file", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T12:00:00.000Z",
      type: "tool.before",
      agent: "backend-coder",
      tool: "write",
      args: { filePath: "src/index.ts" },
      session_id: "sess-1",
    }
    logEvent(dir, event)
    const logPath = join(dir, ".opencode", "flowdeck-events.jsonl")
    expect(existsSync(logPath)).toBe(true)
    const lines = readFileSync(logPath, "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.type).toBe("tool.before")
    expect(parsed.agent).toBe("backend-coder")
    expect(parsed.tool).toBe("write")
  })

  it("does not write when FLOWDECK_EVENT_LOG=off", () => {
    process.env.FLOWDECK_EVENT_LOG = "off"
    try {
      const event: ToolEvent = {
        timestamp: "2024-01-01T12:00:00.000Z",
        type: "tool.before",
        tool: "read",
      }
      logEvent(dir, event)
      const logPath = join(dir, ".opencode", "flowdeck-events.jsonl")
      expect(existsSync(logPath)).toBe(false)
    } finally {
      delete process.env.FLOWDECK_EVENT_LOG
    }
  })

  it("auto-rotates to keep last 1000 lines", () => {
    // Write 1005 events
    for (let i = 0; i < 1005; i++) {
      const event: ToolEvent = {
        timestamp: `2024-01-01T12:00:${String(i % 60).padStart(2, "0")}.000Z`,
        type: "tool.before",
        tool: "read",
        session_id: `sess-${i}`,
      }
      logEvent(dir, event)
    }
    const logPath = join(dir, ".opencode", "flowdeck-events.jsonl")
    const content = readFileSync(logPath, "utf-8")
    const lines = content.trim().split("\n").filter((l) => l.trim())
    expect(lines.length).toBeLessThanOrEqual(1000)
    // The last line should be the most recent event
    const last = JSON.parse(lines[lines.length - 1])
    expect(last.session_id).toBe("sess-1004")
  })

  it("returns false and marks health unhealthy on persistence failure", () => {
    resetEventLogHealth()
    const invalidDir = join(dir, "nonexistent", "deep", "path")
    const event: ToolEvent = {
      timestamp: "2024-01-01T12:00:00.000Z",
      type: "tool.before",
      tool: "read",
    }
    const result = logEvent(invalidDir, event)
    expect(result).toBe(false)
    expect(isEventLogHealthy()).toBe(false)
  })

  it("captures the last persistence error message", () => {
    resetEventLogHealth()
    const invalidDir = join(dir, "nonexistent", "deep", "path")
    const event: ToolEvent = {
      timestamp: "2024-01-01T12:00:00.000Z",
      type: "tool.before",
      tool: "read",
    }
    logEvent(invalidDir, event)
    expect(getLastPersistenceError()).toBe("Invalid directory")
  })

  it("does not corrupt log during concurrent writes", () => {
    const readSpy = vi.spyOn(fsModule, "readFileSync")

    // Write 10 events rapidly
    for (let i = 0; i < 10; i++) {
      const event: ToolEvent = {
        timestamp: `2024-01-01T12:00:${String(i).padStart(2, "0")}.000Z`,
        type: "tool.before",
        tool: "read",
        session_id: `sess-${i}`,
      }
      logEvent(dir, event)
    }

    // The current implementation reads the entire file during rotation,
    // which is non-atomic and can corrupt logs under concurrent writes.
    // A proper atomic implementation should not read the full log file.
    const logCalls = readSpy.mock.calls.filter((call) =>
      String(call[0]).includes("flowdeck-events.jsonl")
    )
    expect(logCalls).toHaveLength(0)
    readSpy.mockRestore()

    const logPath = join(dir, ".opencode", "flowdeck-events.jsonl")
    const content = readFileSync(logPath, "utf-8")
    const lines = content.trim().split("\n").filter((l) => l.trim())
    // All 10 events should be valid JSON
    expect(lines).toHaveLength(10)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })

  it("rejects directory paths containing path traversal", () => {
    const traversalDir = join(dir, "..", "evil")
    const event: ToolEvent = {
      timestamp: "2024-01-01T12:00:00.000Z",
      type: "tool.before",
      tool: "read",
    }
    // Should either throw or not write outside the intended directory
    logEvent(traversalDir, event)
    // The log should NOT be written in a parent directory
    const parentLog = join(dir, "..", "evil", ".opencode", "flowdeck-events.jsonl")
    expect(existsSync(parentLog)).toBe(false)
  })
})

describe("formatEventForStderr", () => {
  it("formats tool.before with write tool", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T14:32:01.234Z",
      type: "tool.before",
      agent: "backend-coder",
      tool: "write",
      args: { filePath: "src/auth.ts" },
    }
    const line = formatEventForStderr(event)
    expect(line).toContain("14:32:01.234")
    expect(line).toContain("✏️")
    expect(line).toContain("backend-coder")
    expect(line).toContain("write")
    expect(line).toContain("src/auth.ts")
  })

  it("formats tool.after with success status", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T14:32:03.789Z",
      type: "tool.after",
      agent: "backend-coder",
      tool: "write",
      args: { filePath: "src/auth.ts" },
      status: "success",
      duration_ms: 123,
    }
    const line = formatEventForStderr(event)
    expect(line).toContain("✅")
    expect(line).toContain("123ms")
  })

  it("formats tool.after with error status", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T14:32:03.789Z",
      type: "tool.after",
      agent: "backend-coder",
      tool: "write",
      status: "error",
      error: "Permission denied",
    }
    const line = formatEventForStderr(event)
    expect(line).toContain("❌")
    expect(line).toContain("Permission denied")
  })

  it("formats tool.after with blocked status", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T14:32:03.789Z",
      type: "tool.after",
      agent: "backend-coder",
      tool: "write",
      status: "blocked",
    }
    const line = formatEventForStderr(event)
    expect(line).toContain("⛔")
  })

  it("formats session.created event", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T14:32:00.000Z",
      type: "session.created",
      session_id: "sess-1",
    }
    const line = formatEventForStderr(event)
    expect(line).toContain("session created")
    expect(line).toContain("sess-1")
  })

  it("formats session.idle event", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T14:32:00.000Z",
      type: "session.idle",
      session_id: "sess-1",
    }
    const line = formatEventForStderr(event)
    expect(line).toContain("session idle")
  })

  it("formats session.error event", () => {
    const event: ToolEvent = {
      timestamp: "2024-01-01T14:32:00.000Z",
      type: "session.error",
      error: "Something went wrong",
    }
    const line = formatEventForStderr(event)
    expect(line).toContain("Something went wrong")
  })
})

describe("sanitizeArgs", () => {
  it("keeps file paths", () => {
    const args = { filePath: "src/index.ts", offset: 10 }
    const result = sanitizeArgs(args)
    expect(result.filePath).toBe("src/index.ts")
    expect(result.offset).toBe(10)
  })

  it("truncates large content strings", () => {
    const args = { filePath: "src/index.ts", content: "a".repeat(500) }
    const result = sanitizeArgs(args)
    expect(result.content).toContain("truncated")
    expect(result.filePath).toBe("src/index.ts")
  })

  it("leaves short content unchanged", () => {
    const args = { content: "hello" }
    const result = sanitizeArgs(args)
    expect(result.content).toBe("hello")
  })

  it("truncates newString and oldString", () => {
    const args = { newString: "b".repeat(200), oldString: "c".repeat(200) }
    const result = sanitizeArgs(args)
    expect(result.newString).toContain("truncated")
    expect(result.oldString).toContain("truncated")
  })

  it("returns empty object for null args", () => {
    expect(sanitizeArgs(null)).toEqual({})
    expect(sanitizeArgs(undefined)).toEqual({})
  })

  it("redacts sensitive keys like apiKey, token, password", () => {
    const args = {
      filePath: "src/config.ts",
      apiKey: "sk-abc123",
      token: "Bearer xyz789",
      password: "supersecret",
      secret: "my-secret-value",
      authorization: "Basic auth123",
    }
    const result = sanitizeArgs(args)
    expect(result.apiKey).toBe("[REDACTED]")
    expect(result.token).toBe("[REDACTED]")
    expect(result.password).toBe("[REDACTED]")
    expect(result.secret).toBe("[REDACTED]")
    expect(result.authorization).toBe("[REDACTED]")
    expect(result.filePath).toBe("src/config.ts") // non-sensitive kept
  })
})

describe("getCurrentAgent / setCurrentAgent", () => {
  beforeEach(() => {
    setCurrentAgent(null)
  })

  it("returns null initially", () => {
    expect(getCurrentAgent()).toBeNull()
  })

  it("returns the agent after setting", () => {
    setCurrentAgent("backend-coder")
    expect(getCurrentAgent()).toBe("backend-coder")
  })

  it("updates the agent when set again", () => {
    setCurrentAgent("backend-coder")
    setCurrentAgent("reviewer")
    expect(getCurrentAgent()).toBe("reviewer")
  })
})
