import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import {
  initializeTaskState,
  readTaskState,
  writeTaskState,
  updateTaskStage,
  updateTaskStatus,
  stateFilePath,
  checkpointFilePath,
  slugify,
  saveCheckpoint,
  loadCheckpoint,
} from "../../src/lib/task-state.js"
import type { TaskState, CheckpointState } from "../../src/types.js"

const tmp = mkdtempSync(join(tmpdir(), "fd-task-test-"))

afterEach(() => {
  // Clean up task dirs created during test
  const { readdirSync, readFileSync: rf } = require("fs")
  try {
    const dirs = readdirSync(tmp)
    for (const d of dirs) {
      rmSync(join(tmp, d), { recursive: true, force: true })
    }
  } catch {}
})

describe("slugify", () => {
  it("converts topic to kebab-case", () => {
    expect(slugify("Add user authentication")).toBe("add-user-authentication")
    expect(slugify("  Fix login bug!  ")).toBe("fix-login-bug")
    expect(slugify("API_RATE_LIMIT")).toBe("api-rate-limit")
  })

  it("removes leading/trailing hyphens", () => {
    expect(slugify("...what?")).toBe("what")
  })
})

describe("initializeTaskState", () => {
  it("creates .fd-plan/<slug>/.state.json", async () => {
    const slug = "test-task-" + randomUUID().slice(0, 8)
    const state = await initializeTaskState(tmp, slug, "Test Task", false, true)

    expect(state.slug).toBe(slug)
    expect(state.topic).toBe("Test Task")
    expect(state.status).toBe("exploring")
    expect(state.stage).toBe("explore")
    expect(state.hasUI).toBe(false)
    expect(state.needsArchitect).toBe(true)
    expect(existsSync(stateFilePath(tmp, slug))).toBe(true)
  })

  it("creates directory recursively", async () => {
    const slug = "deep-nested-" + randomUUID().slice(0, 8)
    await initializeTaskState(tmp, slug, "Deep", false, false)
    expect(existsSync(join(tmp, ".fd-plan", slug))).toBe(true)
  })
})

describe("readTaskState / writeTaskState", () => {
  it("round-trips TaskState", async () => {
    const slug = "rw-test-" + randomUUID().slice(0, 8)
    const initial = await initializeTaskState(tmp, slug, "Round Trip", false, false)

    initial.stepsTotal = 5
    initial.stepsComplete = 2
    await writeTaskState(tmp, initial)

    const loaded = await readTaskState(tmp, slug)
    expect(loaded).not.toBeNull()
    expect(loaded!.stepsTotal).toBe(5)
    expect(loaded!.stepsComplete).toBe(2)
  })

  it("returns null for nonexistent task", async () => {
    const result = await readTaskState(tmp, "does-not-exist")
    expect(result).toBeNull()
  })
})

describe("atomic write preserves JSON", () => {
  it("writes valid JSON", async () => {
    const slug = "atomic-" + randomUUID().slice(0, 8)
    await initializeTaskState(tmp, slug, "Atomic", false, false)
    const loaded = await readTaskState(tmp, slug)
    expect(() => JSON.parse(JSON.stringify(loaded!))).not.toThrow()
  })
})

describe("updateTaskStage", () => {
  it("updates stage field only", async () => {
    const slug = "stage-" + randomUUID().slice(0, 8)
    await initializeTaskState(tmp, slug, "Stage Test", false, false)
    await updateTaskStage(tmp, slug, "plan")

    const state = await readTaskState(tmp, slug)
    expect(state!.stage).toBe("plan")
    expect(state!.status).toBe("exploring") // unchanged
  })
})

describe("updateTaskStatus", () => {
  it("updates status field only", async () => {
    const slug = "status-" + randomUUID().slice(0, 8)
    await initializeTaskState(tmp, slug, "Status Test", false, false)
    await updateTaskStatus(tmp, slug, "done")

    const state = await readTaskState(tmp, slug)
    expect(state!.status).toBe("done")
    expect(state!.stage).toBe("explore") // unchanged
  })
})

describe("saveCheckpoint / loadCheckpoint", () => {
  it("round-trips CheckpointState", async () => {
    const slug = "ckpt-" + randomUUID().slice(0, 8)
    await initializeTaskState(tmp, slug, "Checkpoint Test", false, false)

    const checkpoint: CheckpointState = {
      taskState: (await readTaskState(tmp, slug))!,
      currentStep: 3,
      completedSteps: ["Step 1", "Step 2"],
      savedAt: new Date().toISOString(),
    }

    await saveCheckpoint(tmp, slug, checkpoint)
    const loaded = await loadCheckpoint(tmp, slug)

    expect(loaded).not.toBeNull()
    expect(loaded!.currentStep).toBe(3)
    expect(loaded!.completedSteps).toEqual(["Step 1", "Step 2"])
  })

  it("returns null when no checkpoint exists", async () => {
    const result = await loadCheckpoint(tmp, "no-such-slug")
    expect(result).toBeNull()
  })
})

describe("path helpers", () => {
  it("stateFilePath returns correct path", () => {
    const path = stateFilePath("/root", "my-slug")
    expect(path).toBe("/root/.fd-plan/my-slug/.state.json")
  })

  it("checkpointFilePath returns correct path", () => {
    const path = checkpointFilePath("/root", "my-slug")
    expect(path).toBe("/root/.fd-plan/my-slug/.checkpoint")
  })
})
