import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { writeTaskState } from "../src/state/plan"
import { onSessionStart } from "../src/hooks/session"
import type { TaskState } from "../src/types"

describe("onSessionStart pending task surface", () => {
  let tmpDir: string
  const logs: string[] = []
  const originalLog = console.log

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-session-test-")
    console.log = (msg: string) => logs.push(msg)
    logs.length = 0
  })

  afterEach(() => {
    console.log = originalLog
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should inject pending task notice when pending task exists", async () => {
    const state: TaskState = {
      topic: "Add user authentication",
      slug: "add-auth",
      date: "2026-07-13",
      status: "executing",
      stage: "execute",
      hasUI: false,
      needsArchitect: false,
      planConfirmed: true,
      stepsTotal: 4,
      stepsComplete: 2,
      lastUpdatedAt: new Date().toISOString(),
    }
    writeTaskState(tmpDir, state)

    await onSessionStart({ directory: tmpDir })

    const output = logs.join("\n")
    expect(output).toContain("Pending task found")
    expect(output).toContain("Add user authentication")
    expect(output).toContain("step 2/4")
  })

  it("should print normal session start when no pending tasks", async () => {
    await onSessionStart({ directory: tmpDir })

    expect(logs[0]).toContain("Session started")
  })
})
