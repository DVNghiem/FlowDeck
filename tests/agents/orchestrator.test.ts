/**
 * Orchestrator Agent Tests
 *
 * Covers:
 * - Orchestrator prompt enforces evaluate-discuss-route-selfcorrect flow
 * - Orchestrator prompt forbids direct execution
 * - Orchestrator prompt includes direct/standard/verify-heavy workflow table
 * - Orchestrator prompt includes default-executor for simple tasks
 * - Orchestrator prompt includes allowed/forbidden tool lists
 * - buildOrchestratorPrompt includes/excludes agents correctly
 * - createOrchestratorAgent produces valid definition
 */

import { describe, it, expect } from "vitest"
import {
  buildOrchestratorPrompt,
  createOrchestratorAgent,
} from "@/agents/orchestrator"
import { getAgentRoutes, AGENT_NAMES } from "@/agents/index"

describe("orchestrator prompt: core router rule", () => {
  const prompt = buildOrchestratorPrompt()

  it("declares 'You are a coordinator, not an executor' as a core rule", () => {
    expect(prompt).toContain("You are a coordinator, not an executor")
  })

  it("forbids writing or editing files directly", () => {
    expect(prompt).toContain("NEVER")
    expect(prompt).toMatch(/write, edit, patch, create/i)
  })

  it("forbids running shell commands directly", () => {
    expect(prompt).toContain("NEVER")
    expect(prompt).toMatch(/bash \(mutating\)/i)
  })

  it("forbids executing or running code directly", () => {
    expect(prompt).toMatch(/execute|run code/i)
    expect(prompt).toContain("NEVER")
  })

  it("forbids running the full coding workflow itself", () => {
    expect(prompt).toMatch(/coordinator, not an executor/i)
    expect(prompt).toContain("NEVER")
  })
})

describe("orchestrator prompt: evaluate-discuss-route-selfcorrect sections", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes a 'Task Evaluation' section", () => {
    expect(prompt).toMatch(/##\s*Task Evaluation/i)
  })

  it("evaluate section requires scoring complexity and risk", () => {
    expect(prompt).toMatch(/Complexity/i)
    expect(prompt).toMatch(/Risk/i)
  })

  it("includes a 'Workflow Classification' section", () => {
    expect(prompt).toMatch(/##\s*Workflow Classification/i)
  })

  it("classification includes a rules table", () => {
    expect(prompt).toMatch(/Classification rules/i)
    expect(prompt).toMatch(/Bug signals dominate/i)
  })

  it("classification says to call task tool immediately after routing", () => {
    expect(prompt).toMatch(/Call `task` tool immediately/)
  })

  it("includes a 'Routing Decision Log' section", () => {
    expect(prompt).toMatch(/##\s*Routing Decision Log/i)
  })

  it("routing decision log defines workflow classes", () => {
    expect(prompt).toMatch(/\*\*Task:\*\*/i)
    expect(prompt).toMatch(/\*\*Complexity:\*\*/i)
    expect(prompt).toMatch(/\*\*Risk:\*\*/i)
    expect(prompt).toMatch(/\*\*Workflow:\*\*/i)
    expect(prompt).toMatch(/\*\*Stages:\*\*/i)
    expect(prompt).toMatch(/\*\*Reason:\*\*/i)
  })

  it("includes a 'WHEN YOU SEE [Orchestrator Guard]' section", () => {
    expect(prompt).toMatch(/##\s*WHEN YOU SEE \[Orchestrator Guard\]/i)
  })

  it("guard section says to mention an agent immediately when blocked", () => {
    expect(prompt).toMatch(/Mention the correct agent/i)
    expect(prompt).toMatch(/Do NOT report "blocked"/i)
  })

  it("includes a 'Recovery Ladder' section", () => {
    expect(prompt).toMatch(/##\s*Recovery Ladder/i)
  })

  it("recovery ladder caps retries at 3 (never loop more than 3 times)", () => {
    expect(prompt).toMatch(/never loop more than 3 times/i)
  })

  it("recovery ladder says retry once, then different agent, then stop", () => {
    expect(prompt).toMatch(/retry once/i)
    expect(prompt).toMatch(/different agent/i)
    expect(prompt).toMatch(/STOP and report to the human/i)
  })
})

describe("orchestrator prompt: routing decision log", () => {
  const prompt = buildOrchestratorPrompt()

  it("requires a 'Routing Decision' log format", () => {
    expect(prompt).toContain("Routing Decision")
  })

  it("requires 'Task' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Task:\*\*/)
  })

  it("requires 'Complexity' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Complexity:\*\*/)
  })

  it("requires 'Risk' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Risk:\*\*/)
  })

  it("requires 'Workflow' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Workflow:\*\*/)
  })

  it("requires 'Stages' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Stages:\*\*/)
  })

  it("requires 'Reason' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Reason:\*\*/)
  })
})

describe("orchestrator prompt: allowed vs forbidden tools", () => {
  const prompt = buildOrchestratorPrompt()

  it("references auto-learner for lesson/review delegation", () => {
    expect(prompt).toMatch(/auto-learner/)
  })

  it("explicitly lists allowed tools in 'Tool Permissions' section", () => {
    expect(prompt).toContain("You may ONLY use these tools directly")
  })

  it("allows read tool", () => {
    expect(prompt).toContain("read")
  })

  it("allows search/grep tools", () => {
    expect(prompt).toMatch(/search|grep/)
  })

  it("allows planning-state tool", () => {
    expect(prompt).toContain("planning-state")
  })

  it("allows codebase-state tool", () => {
    expect(prompt).toContain("codebase-state")
  })

  it("allows repo-memory tool", () => {
    expect(prompt).toContain("repo-memory")
  })

  it("allows review-lessons tool", () => {
    expect(prompt).toContain("review-lessons")
  })

  it("allows capture-lesson tool", () => {
    expect(prompt).toContain("capture-lesson")
  })

  it("forbids write tools explicitly", () => {
    expect(prompt).toMatch(/NEVER.*write/)
  })

  it("forbids edit tools explicitly", () => {
    expect(prompt).toMatch(/NEVER.*edit/)
  })

  it("forbids bash tools explicitly", () => {
    expect(prompt).toMatch(/NEVER.*bash/)
  })
})

describe("orchestrator prompt: handoff protocol", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes a 'Routing → Runtime Handoff' section", () => {
    expect(prompt).toContain("Routing → Runtime Handoff")
  })

  it("does not instruct the orchestrator to call a delegate tool", () => {
    expect(prompt).not.toContain("delegate(")
    expect(prompt).not.toContain("delegate(workerId, workflowId")
  })

  it("does not mention a custom delegate tool for handoff", () => {
    expect(prompt).not.toContain("`delegate`")
    expect(prompt).not.toMatch(/delegate\(/)
  })

  it("instructs the orchestrator to call the task tool for handoff", () => {
    expect(prompt).toMatch(/`task` tool/)
    expect(prompt).toMatch(/Call `task` tool immediately/)
  })

  it("tells the orchestrator to mention the selected worker directly", () => {
    expect(prompt).toMatch(/Mention the selected worker directly/)
  })

  it("tells the orchestrator not to stop after the routing summary", () => {
    expect(prompt).toMatch(/Do not report "blocked"/)
    expect(prompt).toMatch(/continue supervising after it/)
  })

  it("tells the orchestrator to continue supervising", () => {
    expect(prompt).toMatch(/continue supervising/)
  })
})

describe("orchestrator prompt: escalation behavior", () => {
  const prompt = buildOrchestratorPrompt()

  it("describes workflow classes", () => {
    expect(prompt).toContain("trivial")
    expect(prompt).toContain("standard")
    expect(prompt).toContain("bugfix")
    expect(prompt).toContain("complex")
  })

  it("forbids orchestrator from executing even after escalation", () => {
    expect(prompt).toMatch(/coordinator, not an executor/i)
  })

  it("includes self-correction rule for orchestrator guard blocks", () => {
    expect(prompt).toContain("WHEN YOU SEE [Orchestrator Guard]")
    expect(prompt).toContain('Do NOT report "blocked"')
    expect(prompt).toMatch(/Mention the correct agent/i)
  })
})

describe("orchestrator prompt: no references to deleted tools", () => {
  const prompt = buildOrchestratorPrompt()

  it("does not mention ContextIngressService", () => {
    expect(prompt).not.toContain("ContextIngressService")
  })

  it("does not mention the deleted tool-selection-policy", () => {
    expect(prompt).not.toContain("tool-selection-policy")
  })

  it("does not mention web_research / library_docs runtime intent classification", () => {
    expect(prompt).not.toContain("web_research")
    expect(prompt).not.toContain("library_docs")
    expect(prompt).not.toContain("code_graph_understanding")
    expect(prompt).not.toContain("token_sensitive_reading")
  })

  it("does not mention FLOWDECK_DISABLE_MCP", () => {
    expect(prompt).not.toContain("FLOWDECK_DISABLE_MCP")
  })

  it("does not mention council, compaction, or decision tracing", () => {
    expect(prompt).not.toContain("council")
    expect(prompt).not.toMatch(/compaction/i)
    expect(prompt).not.toMatch(/decision tracing/i)
  })

  it("does not mention approval manager or execution-substrate", () => {
    expect(prompt).not.toContain("approval manager")
    expect(prompt).not.toContain("execution-substrate")
  })

  it("does not claim routing decisions are persisted to WORKFLOW_ROUTING.jsonl", () => {
    expect(prompt).not.toContain("WORKFLOW_ROUTING.jsonl")
  })

  it("does not reference routingReason field", () => {
    expect(prompt).not.toMatch(/routingReason/)
  })
})

describe("orchestrator prompt: token optimization rules", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes a 'Token Optimization' section near the top", () => {
    expect(prompt).toMatch(/##\s*Token Optimization/i)
  })

  it("token optimization section appears after the 'Task Evaluation' section", () => {
    const tokenIndex = prompt.indexOf("## Token Optimization")
    const evaluateIndex = prompt.indexOf("## Task Evaluation")
    expect(tokenIndex).toBeGreaterThan(-1)
    expect(evaluateIndex).toBeGreaterThan(-1)
    expect(tokenIndex).toBeGreaterThan(evaluateIndex)
  })

  it("token optimization section contains the 'Read as little as possible' header", () => {
    expect(prompt).toContain("Read as little as possible before acting")
  })

  it("token optimization section contains the 'Tool selection' header", () => {
    expect(prompt).toContain("Tool selection")
  })

  it("token optimization section contains the 'Stop when you have enough' header", () => {
    expect(prompt).toContain("Stop when you have enough")
  })

  it("token optimization section contains the 'Retry targeted, not broad' header", () => {
    expect(prompt).toContain("Retry targeted, not broad")
  })

  it("token optimization section prefers `read` over `bash` for reading files", () => {
    expect(prompt).toMatch(/Never use `bash` just to read a file/)
  })

  it("token optimization section recommends `grep` with a specific pattern over `glob`", () => {
    expect(prompt).toMatch(/use `grep` with a specific pattern/)
  })

  it("token optimization section recommends `codegraph-search` over bash loops", () => {
    expect(prompt).toMatch(/codegraph-search/)
  })
})

describe("buildOrchestratorPrompt: agent filtering", () => {
  it("includes @default-executor when not disabled", () => {
    const prompt = buildOrchestratorPrompt()
    expect(prompt).toContain("@default-executor")
  })

  it("marks disabled agents in the Available Agents section", () => {
    const disabled = new Set(["default-executor", "backend-coder"])
    const prompt = buildOrchestratorPrompt(disabled)
    const delegationSection = prompt.split("<Delegation>")[1] ?? ""
    expect(delegationSection).toContain("@default-executor (disabled for current stage)")
    expect(delegationSection).toContain("@backend-coder (disabled for current stage)")
  })

  it("includes non-disabled agents without disabled hint", () => {
    const disabled = new Set(["default-executor"])
    const prompt = buildOrchestratorPrompt(disabled)
    const delegationSection = prompt.split("<Delegation>")[1] ?? ""
    expect(delegationSection).toContain("@default-executor (disabled for current stage)")
    expect(delegationSection).toContain("@backend-coder")
    expect(delegationSection).not.toContain("@backend-coder (disabled")
    expect(delegationSection).toContain("@frontend-coder")
  })

  it("appends workflow class context when provided", () => {
    const prompt = buildOrchestratorPrompt(undefined, "direct")
    expect(prompt).toContain("Active workflow class: direct")
  })
})

describe("createOrchestratorAgent", () => {
  it("creates an agent definition with correct name", () => {
    const agent = createOrchestratorAgent()
    expect(agent.name).toBe("orchestrator")
  })

  it("description mentions routing, not execution", () => {
    const agent = createOrchestratorAgent()
    expect(agent.description).toContain("Routes all work")
    expect(agent.description).toContain("Does not execute tasks directly")
  })

  it("uses temperature 0.1", () => {
    const agent = createOrchestratorAgent()
    expect(agent.config.temperature).toBe(0.1)
  })

  it("includes the core router rule and the new evaluate-discuss-route sections", () => {
    const agent = createOrchestratorAgent()
    expect(agent.config.prompt).toContain("You are a coordinator, not an executor")
    expect(agent.config.prompt).toMatch(/##\s*Task Evaluation/i)
    expect(agent.config.prompt).toMatch(/##\s*Workflow Classification/i)
    expect(agent.config.prompt).toMatch(/##\s*Routing Decision Log/i)
    expect(agent.config.prompt).toMatch(/##\s*WHEN YOU SEE \[Orchestrator Guard\]/i)
    expect(agent.config.prompt).toMatch(/##\s*Recovery Ladder/i)
  })

  it("accepts a custom model", () => {
    const agent = createOrchestratorAgent("gpt-4")
    expect(agent.config.model).toBe("gpt-4")
  })

  it("accepts a custom prompt override", () => {
    const custom = "CUSTOM PROMPT"
    const agent = createOrchestratorAgent(undefined, custom)
    expect(agent.config.prompt).toBe(custom)
  })

  it("accepts a custom append prompt", () => {
    const agent = createOrchestratorAgent(undefined, undefined, "APPENDED")
    expect(agent.config.prompt).toContain("APPENDED")
  })

  it("accepts model array for fallback", () => {
    const agent = createOrchestratorAgent(["model-a", { id: "model-b", variant: "fast" }])
    expect(agent._modelArray).toEqual([
      { id: "model-a" },
      { id: "model-b", variant: "fast" },
    ])
  })
})

/**
 * Regression: the orchestrator prompt must cover every non-orchestrator agent
 * in AGENT_NAMES so it can route to it via the @name syntax. Descriptions are
 * now derived from the live registry (getAgentRoutes) instead of a hand-coded
 * map, so this test guards against registry/prompt drift.
 */
describe("orchestrator prompt: registry-derived agent coverage", () => {
  const requiredAgents = AGENT_NAMES.filter((name) => name !== "orchestrator")

  it.each(requiredAgents)(
    "orchestrator prompt exposes an @%s delegation block with a Role line",
    (agent) => {
      const prompt = buildOrchestratorPrompt()
      expect(prompt).toContain(`@${agent}`)
      const blockRegex = new RegExp(`@${agent}\\s*\\n[\\s\\S]*?- Role:`, "m")
      expect(prompt).toMatch(blockRegex)
    },
  )

  it("derived routes match the non-orchestrator AGENT_NAMES set", () => {
    const routeNames = getAgentRoutes().map((r) => r.name).sort()
    const expected = requiredAgents.slice().sort()
    expect(routeNames).toEqual(expected)
  })
})
