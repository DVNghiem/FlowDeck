import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEventLogHooks } from "@/hooks/event-log-hook"
import { LoopDetector } from "@/services/loop-detector"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-loop-guard-test-"))
}

/**
 * Simulates the exact tool.execute.before / after flow from src/index.ts,
 * wiring eventLog hooks to the loopDetector via the onToolAfter callback.
 */
async function simulateHookFlow(
  eventLog: ReturnType<typeof createEventLogHooks>,
  loopDetector: LoopDetector,
  toolInput: any,
  toolOutput: any,
  directory: string,
  appLog: (msg: string) => void
): Promise<void> {
  // Before hook (from src/index.ts)
  await eventLog.before({ directory }, toolInput, toolOutput)

  const loopResult = loopDetector.checkBefore(
    toolInput.tool ?? toolInput.name ?? "unknown",
    toolOutput?.args ?? toolInput?.args ?? {},
    toolInput.sessionID ?? ""
  )

  if (loopResult.action === "block") {
    throw new Error(loopResult.escalationMessage)
  }
  if (loopResult.action === "warn") {
    appLog(loopResult.message)
  }

  // After hook (from src/index.ts)
  const eventLogHealthy = await eventLog.after({ directory }, toolInput, toolOutput)
  if (!eventLogHealthy) {
    loopDetector.setPersistenceHealthy(false)
  }
}

describe("loop-guard-integration", () => {
  let dir: string
  let appLogMessages: string[]
  let appLog: (msg: string) => void

  beforeEach(() => {
    dir = makeTempDir()
    appLogMessages = []
    appLog = (msg: string) => appLogMessages.push(msg)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("throws escalation message on loop detected in before hook", async () => {
    const loopDetector = new LoopDetector({ maxRepeats: 1 }, appLog)
    const eventLog = createEventLogHooks(appLog, (toolName, args, output, sessionId, status) => {
      loopDetector.recordAfter(toolName, args, output, sessionId, status as "success" | "error" | "blocked")
    })

    const toolInput = { tool: "bash", sessionID: "sess-1" }
    const toolOutput = { args: { command: "cargo test" } }
    const output = "test output"

    // 1st execution — should succeed
    await simulateHookFlow(eventLog, loopDetector, toolInput, toolOutput, dir, appLog)

    // 2nd execution — should succeed
    await simulateHookFlow(eventLog, loopDetector, toolInput, toolOutput, dir, appLog)

    // 3rd execution — should throw because loopDetector blocks
    await expect(
      simulateHookFlow(eventLog, loopDetector, toolInput, toolOutput, dir, appLog)
    ).rejects.toThrow(/FlowDeck Loop Guard/)
  })

  it("executes normally when no loop is detected", async () => {
    const loopDetector = new LoopDetector({ maxRepeats: 2 }, appLog)
    const eventLog = createEventLogHooks(appLog, (toolName, args, output, sessionId, status) => {
      loopDetector.recordAfter(toolName, args, output, sessionId, status as "success" | "error" | "blocked")
    })

    const toolInput = { tool: "read", sessionID: "sess-1" }
    const toolOutput = { args: { filePath: "/tmp/test.txt" } }

    // Execute once
    await simulateHookFlow(eventLog, loopDetector, toolInput, toolOutput, dir, appLog)

    // Should not throw on second call with different output
    const toolOutput2 = { args: { filePath: "/tmp/test.txt" }, content: "different" }
    await simulateHookFlow(eventLog, loopDetector, toolInput, toolOutput2, dir, appLog)
  })

  it("warns loop detector when event logger persistence fails", async () => {
    const loopDetector = new LoopDetector({ maxRepeats: 2 }, appLog)
    const setPersistenceHealthySpy = vi.spyOn(loopDetector, "setPersistenceHealthy")

    // Mock eventLog.after to return false (simulating write failure)
    const eventLog = createEventLogHooks(appLog, (toolName, args, output, sessionId, status) => {
      loopDetector.recordAfter(toolName, args, output, sessionId, status as "success" | "error" | "blocked")
    })

    const originalAfter = eventLog.after
    eventLog.after = async (ctx: { directory: string }, toolInput: any, toolOutput: any) => {
      await originalAfter(ctx, toolInput, toolOutput)
      return false
    }

    const toolInput = { tool: "read", sessionID: "sess-1" }
    const toolOutput = { args: { filePath: "/tmp/test.txt" } }

    await simulateHookFlow(eventLog, loopDetector, toolInput, toolOutput, dir, appLog)

    expect(setPersistenceHealthySpy).toHaveBeenCalledWith(false)
    expect(appLogMessages.some((m) => m.includes("in-memory only"))).toBe(true)

    setPersistenceHealthySpy.mockRestore()
  })

  it("warn action logs via appLog but does not throw", async () => {
    const loopDetector = new LoopDetector({ maxRepeats: 2 }, appLog)
    const checkBeforeSpy = vi.spyOn(loopDetector, "checkBefore").mockReturnValue({
      action: "warn",
      message: "Loop detector warning: approaching threshold",
    })

    const eventLog = createEventLogHooks(appLog, (toolName, args, output, sessionId, status) => {
      loopDetector.recordAfter(toolName, args, output, sessionId, status as "success" | "error" | "blocked")
    })

    const toolInput = { tool: "bash", sessionID: "sess-1" }
    const toolOutput = { args: { command: "cargo test" } }

    // Should not throw
    await simulateHookFlow(eventLog, loopDetector, toolInput, toolOutput, dir, appLog)

    // appLog should have received the warning
    expect(appLogMessages).toContain("Loop detector warning: approaching threshold")

    checkBeforeSpy.mockRestore()
  })
})
