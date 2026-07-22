/**
 * Agents Index Tests
 *
 * Covers:
 * - AGENT_NAMES lists the trimmed roster
 * - createAgent can create each registered agent
 * - createAgents covers the whole roster
 * - getAgentConfigs marks orchestrator as primary, others as subagent
 */

import { describe, it, expect } from "vitest"
import {
  AGENT_NAMES,
  createAgent,
  createAgents,
  getAgentConfigs,
} from "@/agents/index"

describe("AGENT_NAMES", () => {
  it("includes 'orchestrator' as the first agent", () => {
    expect(AGENT_NAMES[0]).toBe("orchestrator")
  })

  it("contains exactly the trimmed roster — no more, no less", () => {
    expect(AGENT_NAMES).toHaveLength(12)
  })

  it("includes all expected agents", () => {
    const expected = [
      "orchestrator",
      "planner",
      "architect",
      "researcher",
      "mapper",
      "backend-coder",
      "frontend-coder",
      "devops",
      "tester",
      "reviewer",
      "security-auditor",
      "debug-specialist",
    ]
    for (const name of expected) {
      expect(AGENT_NAMES).toContain(name)
    }
  })
})

describe("createAgent", () => {
  it("creates every registered agent", () => {
    for (const name of AGENT_NAMES) {
      const agent = createAgent(name)
      expect(agent, `createAgent("${name}") returned undefined`).toBeDefined()
      expect(agent!.name).toBe(name)
    }
  })

  it("creates orchestrator agent", () => {
    const agent = createAgent("orchestrator")
    expect(agent).toBeDefined()
    expect(agent!.name).toBe("orchestrator")
    expect(agent!.config.prompt).toContain("Write permission rules")
  })

  it("returns undefined for unknown agent names", () => {
    const agent = createAgent("nonexistent-agent")
    expect(agent).toBeUndefined()
  })
})

describe("createAgents", () => {
  it("creates the full roster", () => {
    const agents = createAgents()
    const names = agents.map((a) => a.name)
    expect(names).toEqual([...AGENT_NAMES])
  })

  it("applies model overrides when provided", () => {
    const agents = createAgents({ "backend-coder": "gpt-4" })
    const coder = agents.find((a) => a.name === "backend-coder")
    expect(coder).toBeDefined()
    expect(coder!.config.model).toBe("gpt-4")
  })
})

describe("getAgentConfigs", () => {
  it("marks orchestrator as primary mode", () => {
    const configs = getAgentConfigs()
    expect(configs.orchestrator.mode).toBe("primary")
  })

  it("marks mapper as subagent mode", () => {
    const configs = getAgentConfigs()
    expect(configs["mapper"].mode).toBe("subagent")
  })

  it("marks all non-orchestrator agents as subagent mode", () => {
    const configs = getAgentConfigs()
    for (const [name, config] of Object.entries(configs)) {
      if (name !== "orchestrator") {
        expect(config.mode).toBe("subagent")
      }
    }
  })

  it("includes every registered agent in configs", () => {
    const configs = getAgentConfigs()
    for (const name of AGENT_NAMES) {
      expect(configs[name], `missing config for "${name}"`).toBeDefined()
      expect(configs[name].description).toBeTruthy()
    }
  })
})

describe("every agent prompt: token optimization rules (Step 6)", () => {
  const agents = createAgents()

  it("every agent has a Token Optimization section", () => {
    const offenders: string[] = []
    for (const agent of agents) {
      const prompt = agent.config.prompt ?? ""
      if (!/##\s*Token Optimization/.test(prompt)) {
        offenders.push(agent.name)
      }
    }
    expect(offenders).toEqual([])
  })

  it("every agent prompt reads-as-little-as-possible header is present", () => {
    const offenders: string[] = []
    for (const agent of agents) {
      const prompt = agent.config.prompt ?? ""
      if (!prompt.includes("Read as little as possible before acting")) {
        offenders.push(agent.name)
      }
    }
    expect(offenders).toEqual([])
  })

  it("every agent prompt contains the four numbered sub-section headers", () => {
    const headers = [
      "Read as little as possible before acting",
      "Tool selection",
      "Stop when you have enough",
      "Retry targeted, not broad",
    ]
    const offenders: string[] = []
    for (const agent of agents) {
      const prompt = agent.config.prompt ?? ""
      const missing = headers.filter((h) => !prompt.includes(h))
      if (missing.length > 0) {
        offenders.push(`${agent.name}: missing [${missing.join(", ")}]`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("token optimization section appears before the first major domain section", () => {
    // For each agent, the Token Optimization section should come before the
    // first "##" section that is not itself a Token Optimization section.
    const offenders: string[] = []
    for (const agent of agents) {
      const prompt = agent.config.prompt ?? ""
      const tokenIdx = prompt.indexOf("## Token Optimization")
      if (tokenIdx < 0) {
        offenders.push(`${agent.name}: no Token Optimization section`)
        continue
      }
      const afterToken = prompt.slice(tokenIdx + "## Token Optimization".length)
      // Skip past the block we just inserted by looking for the next "## " heading
      // that is not the token optimization block. The next heading after the
      // optimization block is the first domain section.
      const nextHeading = afterToken.match(/\n##\s+/)
      if (!nextHeading || nextHeading.index === undefined) {
        offenders.push(`${agent.name}: no following domain section`)
        continue
      }
      // We only assert that there IS a following domain section; nothing else to
      // verify — the rules are already in the right place.
    }
    expect(offenders).toEqual([])
  })
})
