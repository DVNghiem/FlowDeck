import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { saveCheckpoint, loadCheckpoint } from "../src/execute/checkpoint"
import type { TaskState } from "../src/types"

describe("/fd-checkpoint explicit save", () => {
  let tmpDir: string

  const baseTask: TaskState = {
    topic: "Add auth",
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

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-checkpoint-test-")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should save checkpoint and write .checkpoint file", () => {
    saveCheckpoint(tmpDir, "add-auth", baseTask, 2, ["Step 1", "Step 2"])

    const checkpointPath = join(tmpDir, ".fd-plan", "add-auth", ".checkpoint")
    expect(existsSync(checkpointPath)).toBe(true)
  })

  it("should save checkpoint with correct content", () => {
    saveCheckpoint(tmpDir, "add-auth", baseTask, 2, ["Step 1", "Step 2"])
    const checkpoint = loadCheckpoint(tmpDir, "add-auth")

    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.currentStep).toBe(2)
    expect(checkpoint?.completedSteps).toEqual(["Step 1", "Step 2"])
    expect(checkpoint?.taskState.slug).toBe("add-auth")
    expect(checkpoint?.taskState.status).toBe("executing")
  })

  it("should overwrite existing checkpoint", () => {
    saveCheckpoint(tmpDir, "add-auth", baseTask, 1, ["Step 1"])
    saveCheckpoint(tmpDir, "add-auth", baseTask, 2, ["Step 1", "Step 2"])

    const checkpoint = loadCheckpoint(tmpDir, "add-auth")
    expect(checkpoint?.currentStep).toBe(2)
    expect(checkpoint?.completedSteps).toEqual(["Step 1", "Step 2"])
  })
})
