import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { saveCheckpoint, loadCheckpoint, clearCheckpoint, isStepCompleted } from "../src/execute/checkpoint"
import type { TaskState } from "../src/types"

describe("src/execute/checkpoint.ts", () => {
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
    stepsComplete: 0,
    lastUpdatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-execute-test-")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("saveCheckpoint", () => {
    it("should save checkpoint after step 2", () => {
      saveCheckpoint(tmpDir, "add-auth", baseTask, 2, ["Step 1", "Step 2"])
      const checkpoint = loadCheckpoint(tmpDir, "add-auth")

      expect(checkpoint).not.toBeNull()
      expect(checkpoint?.currentStep).toBe(2)
      expect(checkpoint?.completedSteps).toEqual(["Step 1", "Step 2"])
      expect(checkpoint?.taskState.status).toBe("executing")
    })
  })

  describe("loadCheckpoint", () => {
    it("should return null if no checkpoint exists", () => {
      const checkpoint = loadCheckpoint(tmpDir, "missing-task")
      expect(checkpoint).toBeNull()
    })
  })

  describe("clearCheckpoint", () => {
    it("should delete checkpoint", () => {
      saveCheckpoint(tmpDir, "add-auth", baseTask, 2, ["Step 1", "Step 2"])
      clearCheckpoint(tmpDir, "add-auth")
      const checkpoint = loadCheckpoint(tmpDir, "add-auth")
      expect(checkpoint).toBeNull()
    })
  })

  describe("isStepCompleted", () => {
    it("should return true for completed steps", () => {
      expect(isStepCompleted(["Step 1", "Step 2"], "Step 1")).toBe(true)
    })

    it("should return false for uncompleted steps", () => {
      expect(isStepCompleted(["Step 1"], "Step 2")).toBe(false)
    })
  })
})
