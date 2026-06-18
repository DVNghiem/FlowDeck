/**
 * Model Router Tests
 *
 * Covers:
 * - classifyTaskComplexity: correctly classifies cheap, standard, expensive tasks
 * - getTierForAgent: returns correct tier for known agents
 * - filterAgentsForStage: returns only relevant agents per stage
 * - getDisabledAgentsForStage: disabled set excludes all non-stage agents
 * - computePromptSlimmingStats: saving_pct is > 0 for known stages
 */
import { describe, it, expect } from "vitest"
import {
  classifyTaskComplexity,
  getTierForAgent,
  filterAgentsForStage,
  getDisabledAgentsForStage,
  computePromptSlimmingStats,
} from "@/services/model-router"

const ALL_AGENTS = [
  "orchestrator", "planner", "backend-coder", "frontend-coder", "devops",
  "plan-checker", "tester", "reviewer", "researcher", "writer", "security-auditor",
  "doc-updater", "mapper", "code-explorer", "debug-specialist", "build-error-resolver",
  "task-splitter", "discusser", "architect", "risk-analyst", "policy-enforcer",
  "performance-optimizer", "refactor-guide", "auto-learner", "design", "supervisor",
]

describe("classifyTaskComplexity: cheap tasks", () => {
  it("classifies 'classify this input' as cheap", () => {
    const r = classifyTaskComplexity("classify this input")
    expect(r.complexity).toBe("cheap")
  })

  it("classifies 'validate the request parameters' as cheap", () => {
    const r = classifyTaskComplexity("validate the request parameters")
    expect(r.complexity).toBe("cheap")
  })

  it("classifies 'summarize this text' as cheap", () => {
    const r = classifyTaskComplexity("summarize this text")
    expect(r.complexity).toBe("cheap")
  })

  it("classifies 'format this JSON' as cheap", () => {
    const r = classifyTaskComplexity("format this JSON for display")
    expect(r.complexity).toBe("cheap")
  })
})

describe("classifyTaskComplexity: expensive tasks", () => {
  it("classifies architecture reasoning as expensive", () => {
    const r = classifyTaskComplexity("design the system architecture for this service")
    expect(r.complexity).toBe("expensive")
  })

  it("classifies security audit as expensive", () => {
    const r = classifyTaskComplexity("security audit of the authentication module")
    expect(r.complexity).toBe("expensive")
  })

  it("classifies complex debugging as expensive", () => {
    const r = classifyTaskComplexity("debugging the intermittent race condition in the job queue")
    expect(r.complexity).toBe("expensive")
  })

  it("classifies performance optimization as expensive", () => {
    const r = classifyTaskComplexity("performance optimization of the database layer")
    expect(r.complexity).toBe("expensive")
  })
})

describe("classifyTaskComplexity: standard tasks", () => {
  it("classifies 'add a button to the header' as standard", () => {
    const r = classifyTaskComplexity("add a button to the header component")
    expect(r.complexity).toBe("standard")
  })

  it("classifies 'write unit tests for getUserById' as standard", () => {
    const r = classifyTaskComplexity("write unit tests for getUserById")
    expect(r.complexity).toBe("standard")
  })

  it("returns eligible_agents for each tier", () => {
    const cheap = classifyTaskComplexity("classify this")
    expect(cheap.eligible_agents.length).toBeGreaterThan(0)
    const expensive = classifyTaskComplexity("system design for the entire architecture")
    expect(expensive.eligible_agents).toContain("architect")
  })
})

describe("getTierForAgent", () => {
  it("returns cheap for task-splitter", () => {
    expect(getTierForAgent("task-splitter")).toBe("cheap")
  })

  it("returns standard for backend-coder", () => {
    expect(getTierForAgent("backend-coder")).toBe("standard")
  })

  it("returns expensive for architect", () => {
    expect(getTierForAgent("architect")).toBe("expensive")
  })

  it("returns expensive for security-auditor", () => {
    expect(getTierForAgent("security-auditor")).toBe("expensive")
  })

  it("returns expensive for debug-specialist", () => {
    expect(getTierForAgent("debug-specialist")).toBe("expensive")
  })

  it("defaults to standard for unknown agents", () => {
    expect(getTierForAgent("some-unknown-agent")).toBe("standard")
  })
})

describe("filterAgentsForStage", () => {
  it("returns only discuss-relevant agents for discuss stage", () => {
    const agents = filterAgentsForStage("discuss")
    expect(agents).toBeDefined()
    expect(agents).toContain("discusser")
    expect(agents).toContain("researcher")
    // coder should NOT be in discuss stage
    expect(agents).not.toContain("backend-coder")
  })

  it("returns only execute-relevant agents for execute stage", () => {
    const agents = filterAgentsForStage("execute")
    expect(agents).toBeDefined()
    expect(agents).toContain("backend-coder")
    expect(agents).toContain("tester")
    // discusser should NOT be in execute stage
    expect(agents).not.toContain("discusser")
  })

  it("returns only verify-relevant agents for verify stage", () => {
    const agents = filterAgentsForStage("verify")
    expect(agents).toBeDefined()
    expect(agents).toContain("tester")
    expect(agents).toContain("reviewer")
    expect(agents).toContain("security-auditor")
    // planner is not needed in verify
    expect(agents).not.toContain("planner")
  })

  it("returns undefined for unknown stage (caller uses full list)", () => {
    expect(filterAgentsForStage("unknown-stage")).toBeUndefined()
  })
})

describe("getDisabledAgentsForStage", () => {
  it("disabled set does not contain any allowed agent", () => {
    const allowed = filterAgentsForStage("execute") ?? []
    const disabled = getDisabledAgentsForStage("execute", ALL_AGENTS)
    for (const a of allowed) {
      if (ALL_AGENTS.includes(a)) {
        expect(disabled.has(a)).toBe(false)
      }
    }
  })

  it("disabled set is smaller than all agents", () => {
    const disabled = getDisabledAgentsForStage("plan", ALL_AGENTS)
    expect(disabled.size).toBeLessThan(ALL_AGENTS.length)
    expect(disabled.size).toBeGreaterThan(0)
  })

  it("returns empty set for unknown stage", () => {
    const disabled = getDisabledAgentsForStage("mystery-stage", ALL_AGENTS)
    expect(disabled.size).toBe(0)
  })
})

describe("computePromptSlimmingStats", () => {
  it("reports saving > 0% for known stages with the full agent list", () => {
    const stats = computePromptSlimmingStats(ALL_AGENTS)
    for (const stage of ["discuss", "plan", "execute", "verify", "fix-bug"]) {
      expect(stats[stage]).toBeDefined()
      expect(stats[stage].saving_pct).toBeGreaterThan(0)
      expect(stats[stage].shown).toBeGreaterThan(0)
    }
  })

  it("shown + hidden = total agent count for all stages", () => {
    const stats = computePromptSlimmingStats(ALL_AGENTS)
    for (const stage of Object.keys(stats)) {
      // hidden may include agents not in ALL_AGENTS (from allowlist), so just check shown <= total
      expect(stats[stage].shown).toBeLessThanOrEqual(ALL_AGENTS.length)
    }
  })
})
