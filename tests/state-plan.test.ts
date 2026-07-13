import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import {
  taskDir,
  listTasks,
  readTaskState,
  writeTaskState,
  listPendingTasks,
} from "../src/state/plan"
import type { TaskState } from "../src/types"

describe("src/state/plan.ts", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-test-")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("taskDir", () => {
    it("should resolve task directory path", () => {
      const path = taskDir(tmpDir, "my-task")
      expect(path).toBe(join(tmpDir, ".fd-plan", "my-task"))
    })
  })

  describe("writeTaskState / readTaskState", () => {
    it("should write and read task state", () => {
      const state: TaskState = {
        topic: "Add authentication",
        slug: "add-auth",
        date: "2026-07-13",
        status: "exploring",
        stage: "explore",
        hasUI: false,
        needsArchitect: false,
        planConfirmed: false,
        stepsTotal: 0,
        stepsComplete: 0,
        lastUpdatedAt: new Date().toISOString(),
      }

      writeTaskState(tmpDir, state)
      const read = readTaskState(tmpDir, "add-auth")
      expect(read).toEqual(state)
    })
  })

  describe("listPendingTasks", () => {
    it("should return only non-done tasks", () => {
      const state1: TaskState = {
        topic: "Task 1",
        slug: "task-1",
        date: "2026-07-13",
        status: "exploring",
        stage: "explore",
        hasUI: false,
        needsArchitect: false,
        planConfirmed: false,
        stepsTotal: 0,
        stepsComplete: 0,
        lastUpdatedAt: new Date().toISOString(),
      }

      const state2: TaskState = {
        ...state1,
        slug: "task-2",
        topic: "Task 2",
        status: "done",
      }

      writeTaskState(tmpDir, state1)
      writeTaskState(tmpDir, state2)

      const pending = listPendingTasks(tmpDir)
      expect(pending).toHaveLength(1)
      expect(pending[0].slug).toBe("task-1")
    })
  })
})
