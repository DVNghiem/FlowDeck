/**
 * Default Executor Agent Tests
 *
 * Covers:
 * - Default executor prompt defines execution worker role
 * - Default executor prompt includes execution modes
 * - Default executor prompt forbids orchestration behavior
 * - createDefaultExecutorAgent produces valid definition
 */

import { describe, it, expect } from "vitest"
import { createDefaultExecutorAgent } from "@/agents/default-executor"

describe("createDefaultExecutorAgent", () => {
  it("creates an agent definition with correct name", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.name).toBe("default-executor")
  })

  it("description mentions it is a worker for routed tasks", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.description).toContain("Default execution worker")
    expect(agent.description).toContain("routed by the orchestrator")
  })

  it("uses temperature 0.1", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.temperature).toBe(0.1)
  })

  it("prompt defines 'Your Role' as execution only", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toContain("Your Role")
    expect(agent.config.prompt).toMatch(/You execute\. You do NOT route/i)
  })

  it("prompt includes direct-stock-tools mode", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toContain("direct-stock-tools")
  })

  it("prompt includes quick-answer mode", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toContain("quick-answer")
  })

  it("prompt includes inspect-only mode", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toContain("inspect-only")
  })

  it("prompt includes simple-edit mode", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toContain("simple-edit")
  })

  it("prompt includes escalation rule for complexity discovery", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toMatch(/Escalate if complexity emerges/i)
    expect(agent.config.prompt).toMatch(/report to the orchestrator/i)
  })

  it("prompt forbids acting as an orchestrator", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toMatch(/Do NOT act as an orchestrator yourself/i)
  })

  it("prompt forbids routing work to other agents", () => {
    const agent = createDefaultExecutorAgent()
    expect(agent.config.prompt).toMatch(/Do NOT route work to other agents/i)
  })

  it("accepts a custom model", () => {
    const agent = createDefaultExecutorAgent("gpt-4")
    expect(agent.config.model).toBe("gpt-4")
  })

  it("accepts a custom prompt override", () => {
    const custom = "CUSTOM PROMPT"
    const agent = createDefaultExecutorAgent(undefined, custom)
    expect(agent.config.prompt).toBe(custom)
  })

  it("accepts a custom append prompt", () => {
    const agent = createDefaultExecutorAgent(undefined, undefined, "APPENDED")
    expect(agent.config.prompt).toContain("APPENDED")
  })
})
