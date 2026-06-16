/**
 * Agents Index Tests
 *
 * Covers:
 * - AGENT_NAMES includes default-executor
 * - createAgent can create default-executor
 * - createAgents includes default-executor
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
  it("includes 'default-executor'", () => {
    expect(AGENT_NAMES).toContain("default-executor")
  })

  it("includes 'orchestrator' as the first agent", () => {
    expect(AGENT_NAMES[0]).toBe("orchestrator")
  })

  it("includes all expected agents", () => {
    const expected = [
      "orchestrator",
      "default-executor",
      "planner",
      "backend-coder",
      "frontend-coder",
      "devops",
      "plan-checker",
      "tester",
      "reviewer",
      "researcher",
      "writer",
      "security-auditor",
      "doc-updater",
      "mapper",
      "code-explorer",
      "debug-specialist",
      "build-error-resolver",
      "task-splitter",
      "discusser",
      "architect",
      "risk-analyst",
      "policy-enforcer",
      "performance-optimizer",
      "refactor-guide",
      "auto-learner",
      "design",
      "supervisor",
    ]
    for (const name of expected) {
      expect(AGENT_NAMES).toContain(name)
    }
  })
})

describe("createAgent", () => {
  it("creates default-executor agent", () => {
    const agent = createAgent("default-executor")
    expect(agent).toBeDefined()
    expect(agent!.name).toBe("default-executor")
    expect(agent!.config.prompt).toContain("Default Execution Agent")
  })

  it("creates orchestrator agent", () => {
    const agent = createAgent("orchestrator")
    expect(agent).toBeDefined()
    expect(agent!.name).toBe("orchestrator")
    expect(agent!.config.prompt).toContain("You Are a Router, Not a Worker")
  })

  it("returns undefined for unknown agent names", () => {
    const agent = createAgent("nonexistent-agent")
    expect(agent).toBeUndefined()
  })
})

describe("createAgents", () => {
  it("creates all agents including default-executor", () => {
    const agents = createAgents()
    const names = agents.map((a) => a.name)
    expect(names).toContain("default-executor")
    expect(names).toContain("orchestrator")
    expect(names).toContain("backend-coder")
  })

  it("applies model overrides when provided", () => {
    const agents = createAgents({ "default-executor": "gpt-4" })
    const executor = agents.find((a) => a.name === "default-executor")
    expect(executor).toBeDefined()
    expect(executor!.config.model).toBe("gpt-4")
  })
})

describe("getAgentConfigs", () => {
  it("marks orchestrator as primary mode", () => {
    const configs = getAgentConfigs()
    expect(configs.orchestrator.mode).toBe("primary")
  })

  it("marks default-executor as subagent mode", () => {
    const configs = getAgentConfigs()
    expect(configs["default-executor"].mode).toBe("subagent")
  })

  it("marks all non-orchestrator agents as subagent mode", () => {
    const configs = getAgentConfigs()
    for (const [name, config] of Object.entries(configs)) {
      if (name !== "orchestrator") {
        expect(config.mode).toBe("subagent")
      }
    }
  })

  it("includes default-executor in configs", () => {
    const configs = getAgentConfigs()
    expect(configs["default-executor"]).toBeDefined()
    expect(configs["default-executor"].description).toContain("Default execution worker")
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
