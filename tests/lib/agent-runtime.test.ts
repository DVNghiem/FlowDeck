/**
 * Test suite for agent runtime and delegation.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  MockAgentRuntime,
  setAgentRuntime,
  delegateToAgent,
  getAgentRuntime,
} from "../../src/lib/agent-runtime"
import type { ContextPacket } from "../../src/lib/context-packet"

describe("AgentRuntime", () => {
  let mockRuntime: MockAgentRuntime

  beforeEach(() => {
    mockRuntime = new MockAgentRuntime()
    setAgentRuntime(mockRuntime)
  })

  it("should delegate to mocked agent", async () => {
    mockRuntime.setMockResponse(
      "explorer",
      "<!-- exploration-summary -->\nhas_ui: true\nneeds_architect: false\n<!-- /exploration-summary -->"
    )

    const result = await delegateToAgent("explorer", "Test message")

    expect(result.agentName).toBe("explorer")
    expect(result.output).toContain("exploration-summary")
    expect(result.error).toBeUndefined()
  })

  it("should return error if agent not mocked", async () => {
    const result = await delegateToAgent("unknown-agent", "Test")

    expect(result.error).toBeDefined()
    expect(result.error).toContain("No mock response configured for agent: unknown-agent")
  })

  it("should return error if agent factory not found", async () => {
    const result = await delegateToAgent("nonexistent", "Test")

    expect(result.error).toBeDefined()
    expect(result.error).toContain("No mock response configured for agent: nonexistent")
  })

  it("should pass context packet without modification", async () => {
    mockRuntime.setMockResponse("researcher", "Research output")

    const packet: ContextPacket = {
      slug: "test",
      topic: "Test task",
      currentStep: 1,
      totalSteps: 5,
      stage: "research",
      researchFiles: [],
      architectPatterns: [],
      designNotes: [],
      constraints: [],
    }

    const result = await delegateToAgent("researcher", "Research task", {
      contextPacket: packet,
    })

    expect(result.output).toBe("Research output")
    expect(result.error).toBeUndefined()
  })

  it("should return error from setMockError", async () => {
    mockRuntime.setMockError("explorer", "Simulated network failure")

    const result = await delegateToAgent("explorer", "Test")

    expect(result.error).toBe("Simulated network failure")
    expect(result.output).toBe("")
  })
})

describe("MockAgentRuntime", () => {
  it("should track multiple agent responses independently", async () => {
    const runtime = new MockAgentRuntime()
    runtime.setMockResponse("explorer", "Explorer output")
    runtime.setMockResponse("researcher", "Researcher output")
    runtime.setMockResponse("planner", "Planner output")

    const [exp, res, plan] = await Promise.all([
      runtime.delegate("explorer", ""),
      runtime.delegate("researcher", ""),
      runtime.delegate("planner", ""),
    ])

    expect(exp.output).toBe("Explorer output")
    expect(res.output).toBe("Researcher output")
    expect(plan.output).toBe("Planner output")
  })

  it("should clear error when setMockResponse is called after setMockError", async () => {
    const runtime = new MockAgentRuntime()
    runtime.setMockError("explorer", "Original error")
    runtime.setMockResponse("explorer", "Fixed response")

    const result = await runtime.delegate("explorer", "")

    expect(result.error).toBeUndefined()
    expect(result.output).toBe("Fixed response")
  })

  it("should clear response when setMockError is called after setMockResponse", async () => {
    const runtime = new MockAgentRuntime()
    runtime.setMockResponse("explorer", "Original response")
    runtime.setMockError("explorer", "New error")

    const result = await runtime.delegate("explorer", "")

    expect(result.output).toBe("")
    expect(result.error).toBe("New error")
  })
})

describe("globalAgentRuntime", () => {
  it("should be replaceable via setAgentRuntime", async () => {
    const original = getAgentRuntime()
    const mock = new MockAgentRuntime()
    mock.setMockResponse("explorer", "replaced")

    setAgentRuntime(mock)
    const result = await delegateToAgent("explorer", "")

    expect(result.output).toBe("replaced")

    // Restore
    setAgentRuntime(original)
  })
})
