import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { runFdTask } from "../../src/commands/fd-task.js"
import { MockAgentRuntime, setAgentRuntime, getAgentRuntime } from "../../src/lib/agent-runtime.js"

const tmp = mkdtempSync(join(tmpdir(), "fd-task-cmd-test-"))
const originalRuntime = getAgentRuntime()

afterEach(() => {
  setAgentRuntime(originalRuntime)
  try {
    const { readdirSync } = require("fs")
    for (const d of readdirSync(tmp)) {
      rmSync(join(tmp, d), { recursive: true, force: true })
    }
  } catch {}
})

/** Standard mock responses for a happy-path pipeline run. */
function setupHappyPath(mock: MockAgentRuntime, flags = "<!-- exploration-summary -->\nhas_ui: true\nneeds_architect: false\n<!-- /exploration-summary -->"): void {
  mock.setMockResponse("explorer", flags)
  mock.setMockResponse(
    "researcher",
    "# Research\n\n## Codebase Context\n- Backend service"
  )
  mock.setMockResponse(
    "designer",
    "# Design\n\n## Layout\n- Dashboard page"
  )
  mock.setMockResponse(
    "planner",
    "# Plan\n\n## Summary\nFeature.\n\n## Step 1\nFirst step\n\n## Step 2\nSecond step"
  )
}

describe("runFdTask pipeline", () => {
  it("initializes task state and runs full pipeline to approval gate", async () => {
    const mock = new MockAgentRuntime()
    setAgentRuntime(mock)
    setupHappyPath(mock)

    const result = await runFdTask("Add payment gateway", tmp)

    expect(result.taskSlug).toBe("add-payment-gateway")
    expect(result.finalStatus).toBe("awaiting_confirm")
    expect(result.nextAction).toBe("WAITING_FOR_CONFIRMATION")
    expect(existsSync(result.outputs.explorationPath)).toBe(true)
    expect(existsSync(result.outputs.researchPath)).toBe(true)
    expect(result.outputs.planPath).toBeTruthy()
    expect(existsSync(result.outputs.planPath)).toBe(true)
  })

  it("creates architect path when needs_architect is true", async () => {
    const mock = new MockAgentRuntime()
    setAgentRuntime(mock)
    setupHappyPath(mock, "<!-- exploration-summary -->\nhas_ui: false\nneeds_architect: true\n<!-- /exploration-summary -->")
    mock.setMockResponse(
      "architect",
      "# Architecture Review\n\n## Recommendation\nApproved as-is"
    )

    const result = await runFdTask("API integration", tmp)
    expect(result.outputs.architectPath).toBeDefined()
  })

  it("creates design path when has_ui is true", async () => {
    const mock = new MockAgentRuntime()
    setAgentRuntime(mock)
    setupHappyPath(mock)

    const result = await runFdTask("Dashboard UI", tmp)
    expect(result.outputs.designPath).toBeDefined()
  })

  it("parses step count from plan content", async () => {
    const mock = new MockAgentRuntime()
    setAgentRuntime(mock)
    setupHappyPath(mock)

    const result = await runFdTask("Refactor auth module", tmp)
    const planContent = readFileSync(result.outputs.planPath, "utf-8")
    const stepMatches = planContent.match(/^##\s+Step\s+(\d+)/gim)
    expect(stepMatches).not.toBeNull()
    expect(stepMatches!.length).toBe(2)
  })

  it("throws when pending task already exists", async () => {
    const mock = new MockAgentRuntime()
    setAgentRuntime(mock)
    setupHappyPath(mock)

    await runFdTask("Duplicate task test", tmp)
    await expect(runFdTask("Duplicate task test", tmp)).rejects.toThrow("Pending task found")
  })

  it("returns ABORT when architect recommends redesign", async () => {
    const mock = new MockAgentRuntime()
    setAgentRuntime(mock)
    mock.setMockResponse(
      "explorer",
      "<!-- exploration-summary -->\nhas_ui: false\nneeds_architect: true\n<!-- /exploration-summary -->"
    )
    mock.setMockResponse("researcher", "# Research")
    mock.setMockResponse(
      "architect",
      "# Architecture Review\n\n## Recommendation\n**REQUIRES REDESIGN**\n\nConflicts with service boundaries."
    )

    const result = await runFdTask("Redesign Test", tmp)
    expect(result.nextAction).toBe("ABORT")
    expect(result.outputs.planPath).toBe("")
  })

  it("returns WAITING_FOR_CONFIRMATION at approval gate", async () => {
    const mock = new MockAgentRuntime()
    setAgentRuntime(mock)
    setupHappyPath(mock)

    const result = await runFdTask("Feature flag system", tmp)
    expect(result.nextAction).toBe("WAITING_FOR_CONFIRMATION")
    expect(result.finalStatus).toBe("awaiting_confirm")
  })
})
