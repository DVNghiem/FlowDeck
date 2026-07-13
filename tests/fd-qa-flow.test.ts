import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { writeTaskState, readTaskState } from "../src/state/plan"
import type { TaskState } from "../src/types"

function applyQaDecision(
  state: TaskState,
  decision: "FIX" | "SKIP" | "ABORT"
): TaskState {
  if (decision === "FIX") {
    return { ...state, status: "executing", stage: "execute" }
  }
  if (decision === "SKIP") {
    return { ...state, status: "awaiting_ship", stage: "ship", qaSkipped: true }
  }
  return { ...state, status: "done", stage: "done", aborted: true }
}

describe("/fd-qa fail flow", () => {
  let tmpDir: string

  const baseTask: TaskState = {
    topic: "Add auth",
    slug: "add-auth",
    date: "2026-07-13",
    status: "qa",
    stage: "qa",
    hasUI: false,
    needsArchitect: false,
    planConfirmed: true,
    stepsTotal: 4,
    stepsComplete: 4,
    lastUpdatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    tmpDir = mkdtempSync("/tmp/fd-qa-flow-test-")
    writeTaskState(tmpDir, baseTask)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("FIX should update status to executing", () => {
    const updated = applyQaDecision(baseTask, "FIX")
    writeTaskState(tmpDir, updated)
    const state = readTaskState(tmpDir, "add-auth")
    expect(state?.status).toBe("executing")
    expect(state?.stage).toBe("execute")
  })

  it("SKIP should update status to awaiting_ship with qaSkipped flag", () => {
    const updated = applyQaDecision(baseTask, "SKIP")
    writeTaskState(tmpDir, updated)
    const state = readTaskState(tmpDir, "add-auth")
    expect(state?.status).toBe("awaiting_ship")
    expect(state?.stage).toBe("ship")
    expect(state?.qaSkipped).toBe(true)
  })

  it("ABORT should update status to done with aborted flag", () => {
    const updated = applyQaDecision(baseTask, "ABORT")
    writeTaskState(tmpDir, updated)
    const state = readTaskState(tmpDir, "add-auth")
    expect(state?.status).toBe("done")
    expect(state?.stage).toBe("done")
    expect(state?.aborted).toBe(true)
  })
})
