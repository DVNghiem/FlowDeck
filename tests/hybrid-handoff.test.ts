import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { writeTaskState, readTaskState } from "../src/state/plan"
import type { TaskState, TaskStatus } from "../src/types"

function getCommandForStatus(status: TaskStatus): string {
  switch (status) {
    case "awaiting_confirm": return "/fd-task"
    case "executing": return "/fd-execute"
    case "qa": return "/fd-qa"
    case "awaiting_ship": return "/fd-ship"
    default: return "/fd-task"
  }
}

describe("hybrid handoff", () => {
  let tmpDir: string

  const baseTask: TaskState = {
    topic: "Add auth",
    slug: "add-auth",
    date: "2026-07-13",
    status: "awaiting_confirm",
    stage: "plan",
    hasUI: false,
    needsArchitect: false,
    planConfirmed: false,
    stepsTotal: 4,
    stepsComplete: 0,
    lastUpdatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-hybrid-test-")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should map awaiting_confirm to /fd-task", () => {
    writeTaskState(tmpDir, baseTask)
    const state = readTaskState(tmpDir, "add-auth")
    expect(getCommandForStatus(state!.status)).toBe("/fd-task")
  })

  it("should map executing to /fd-execute", () => {
    writeTaskState(tmpDir, { ...baseTask, status: "executing", stage: "execute" })
    const state = readTaskState(tmpDir, "add-auth")
    expect(getCommandForStatus(state!.status)).toBe("/fd-execute")
  })

  it("should map qa to /fd-qa", () => {
    writeTaskState(tmpDir, { ...baseTask, status: "qa", stage: "qa" })
    const state = readTaskState(tmpDir, "add-auth")
    expect(getCommandForStatus(state!.status)).toBe("/fd-qa")
  })

  it("should map awaiting_ship to /fd-ship", () => {
    writeTaskState(tmpDir, { ...baseTask, status: "awaiting_ship", stage: "ship" })
    const state = readTaskState(tmpDir, "add-auth")
    expect(getCommandForStatus(state!.status)).toBe("/fd-ship")
  })
})
