import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { writeTaskState, markTaskDone, readTaskState } from "../src/state/plan"
import { saveCheckpoint } from "../src/execute/checkpoint"
import type { TaskState } from "../src/types"

describe("markTaskDone", () => {
  let tmpDir: string

  const baseTask: TaskState = {
    topic: "Add auth",
    slug: "add-auth",
    date: "2026-07-13",
    status: "awaiting_ship",
    stage: "ship",
    hasUI: false,
    needsArchitect: false,
    planConfirmed: true,
    stepsTotal: 4,
    stepsComplete: 4,
    lastUpdatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-mark-done-test-")
    writeTaskState(tmpDir, baseTask)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should mark task as done", () => {
    markTaskDone(tmpDir, "add-auth")
    const state = readTaskState(tmpDir, "add-auth")
    expect(state?.status).toBe("done")
    expect(state?.stage).toBe("done")
  })

  it("should clear checkpoint after marking done", () => {
    saveCheckpoint(tmpDir, "add-auth", baseTask, 4, ["Step 1", "Step 2", "Step 3", "Step 4"])
    const checkpointPath = join(tmpDir, ".fd-plan", "add-auth", ".checkpoint")
    expect(existsSync(checkpointPath)).toBe(true)

    markTaskDone(tmpDir, "add-auth")
    expect(existsSync(checkpointPath)).toBe(false)
  })

  it("should be idempotent", () => {
    markTaskDone(tmpDir, "add-auth")
    markTaskDone(tmpDir, "add-auth")
    const state = readTaskState(tmpDir, "add-auth")
    expect(state?.status).toBe("done")
  })
})
