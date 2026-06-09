/**
 * Researcher Agent Tests
 *
 * Covers:
 * - Researcher prompt maintains Context7-first priority
 * - Researcher prompt includes MCP tool guidance
 * - createResearcherAgent produces valid definition
 */

import { describe, it, expect } from "vitest"
import { createResearcherAgent } from "@/agents/researcher"

describe("researcher prompt: search priority", () => {
  const agent = createResearcherAgent(undefined)
  const prompt = agent.config.prompt

  it("declares Context7-first in search order", () => {
    expect(prompt).toContain("Context7 first")
    expect(prompt).toMatch(/1\.\s+\*\*Context7 first\*\*/)
  })

  it("lists vendor docs as second priority", () => {
    expect(prompt).toMatch(/2\.\s+\*\*Vendor docs\*\*/)
  })

  it("lists package registries as third priority", () => {
    expect(prompt).toMatch(/3\.\s+\*\*Package registries\*\*/)
  })
})

describe("researcher prompt: MCP guidance", () => {
  const agent = createResearcherAgent(undefined)
  const prompt = agent.config.prompt

  it("includes an MCP Tool Guidance section", () => {
    expect(prompt).toContain("MCP Tool Guidance")
  })

  it("mentions context7 for library docs", () => {
    expect(prompt).toContain("context7")
    expect(prompt).toMatch(/context7.*library documentation/i)
  })

  it("mentions sequential-thinking for stepwise investigation", () => {
    expect(prompt).toContain("sequential-thinking")
    expect(prompt).toMatch(/sequential-thinking.*stepwise/i)
  })

  it("mentions memory and omega-memory for prior context", () => {
    expect(prompt).toContain("memory")
    expect(prompt).toContain("omega-memory")
    expect(prompt).toMatch(/memory.*prior context/i)
  })

  it("mentions magic for UI/design system research", () => {
    expect(prompt).toContain("magic")
    expect(prompt).toMatch(/magic.*UI\/design system/i)
  })

  it("mentions playwright for browser behavior verification", () => {
    expect(prompt).toContain("playwright")
    expect(prompt).toMatch(/playwright.*browser/i)
  })

  it("mentions token-optimizer for compression", () => {
    expect(prompt).toContain("token-optimizer")
    expect(prompt).toMatch(/token-optimizer.*compress/i)
  })

  it("reinforces Context7-first priority after MCP list", () => {
    expect(prompt).toMatch(/Maintain Context7-first priority/)
  })
})

describe("createResearcherAgent", () => {
  it("creates an agent definition with correct name", () => {
    const agent = createResearcherAgent(undefined)
    expect(agent.name).toBe("researcher")
  })

  it("description mentions research and Context7", () => {
    const agent = createResearcherAgent(undefined)
    expect(agent.description).toContain("Researches")
    expect(agent.description).toContain("Context7")
  })

  it("uses temperature 0.1", () => {
    const agent = createResearcherAgent(undefined)
    expect(agent.config.temperature).toBe(0.1)
  })

  it("accepts a custom model", () => {
    const agent = createResearcherAgent("gpt-4")
    expect(agent.config.model).toBe("gpt-4")
  })

  it("accepts a custom prompt override", () => {
    const custom = "CUSTOM PROMPT"
    const agent = createResearcherAgent(undefined, custom)
    expect(agent.config.prompt).toBe(custom)
  })

  it("accepts a custom append prompt", () => {
    const agent = createResearcherAgent(undefined, undefined, "APPENDED")
    expect(agent.config.prompt).toContain("APPENDED")
  })
})
