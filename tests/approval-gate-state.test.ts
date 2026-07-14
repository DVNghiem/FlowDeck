import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { writeTaskState, readTaskState } from "../src/state/plan"
import type { TaskState } from "../src/types"

function printPlanApprovalGateAndSaveState(taskState: TaskState, root: string): string {
  const updated: TaskState = {
    ...taskState,
    status: "awaiting_confirm",
    stage: "plan",
    lastUpdatedAt: new Date().toISOString(),
  }
  writeTaskState(root, updated)

  return `Plan ready: ${taskState.topic}\nReview: .fd-plan/${taskState.slug}/YYYY-MM-DD-${taskState.slug}-plan.md`
}

describe("approval gate state persistence", () => {
  let tmpDir: string

  const baseTask: TaskState = {
    topic: "Add auth",
    slug: "add-auth",
    date: "2026-07-13",
    status: "planning",
    stage: "plan",
    hasUI: false,
    needsArchitect: false,
    planConfirmed: false,
    stepsTotal: 0,
    stepsComplete: 0,
    lastUpdatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-approval-gate-test-")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should write state before printing gate message", () => {
    const gateMessage = printPlanApprovalGateAndSaveState(baseTask, tmpDir)

    const state = readTaskState(tmpDir, "add-auth")
    expect(state?.status).toBe("awaiting_confirm")
    expect(state?.stage).toBe("plan")

    expect(gateMessage).toContain("Plan ready: Add auth")
  })
})
