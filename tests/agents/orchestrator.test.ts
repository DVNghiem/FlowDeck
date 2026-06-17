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

describe("orchestrator prompt: core router rule", () => {
  const prompt = buildOrchestratorPrompt()

  it("declares 'You Are a Router, Not a Worker' as a core rule", () => {
    expect(prompt).toContain("You Are a Router, Not a Worker")
  })

  it("forbids writing or editing files directly", () => {
    expect(prompt).toContain("NEVER")
    expect(prompt).toMatch(/write or edit files/i)
  })

  it("forbids running shell commands directly", () => {
    expect(prompt).toContain("NEVER")
    expect(prompt).toMatch(/run shell commands/i)
  })

  it("forbids implementing code directly", () => {
    expect(prompt).toMatch(/implement code/i)
    expect(prompt).toContain("NEVER")
  })

  it("forbids running the full coding workflow itself", () => {
    expect(prompt).toMatch(/run the entire coding workflow yourself/i)
    expect(prompt).toContain("NEVER")
  })
})

describe("orchestrator prompt: evaluate-discuss-route-selfcorrect sections", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes an 'Evaluate First, Always' section", () => {
    expect(prompt).toMatch(/##\s*Evaluate First, Always/i)
  })

  it("evaluate section requires scoring clarity and scope", () => {
    expect(prompt).toMatch(/Clarity/i)
    expect(prompt).toMatch(/Scope/i)
  })

  it("includes a 'Discuss Gate' section", () => {
    expect(prompt).toMatch(/##\s*Discuss Gate/i)
  })

  it("discuss gate triggers on two-or-more unclear signals", () => {
    expect(prompt).toMatch(/TWO OR MORE/i)
  })

  it("discuss gate caps questions at 2 in one message", () => {
    expect(prompt).toMatch(/at most\s*\*?\*?2\s*targeted questions/i)
  })

  it("discuss gate prohibits a second discussion round", () => {
    expect(prompt).toMatch(/no second discussion round/i)
  })

  it("discuss gate says to infer when only one signal is unclear", () => {
    expect(prompt).toMatch(/only one signal is unclear/i)
    expect(prompt).toMatch(/infer it/i)
  })

  it("discuss gate says to route immediately when task is clear and small", () => {
    expect(prompt).toMatch(/route immediately with no preamble/i)
  })

  it("includes a 'Route Decision' section", () => {
    expect(prompt).toMatch(/##\s*Route Decision/i)
  })

  it("route decision defines the direct workflow", () => {
    expect(prompt).toMatch(/\*\*direct\*\*/i)
  })

  it("route decision defines the standard workflow", () => {
    expect(prompt).toMatch(/\*\*standard\*\*/i)
  })

  it("route decision defines the verify-heavy workflow", () => {
    expect(prompt).toMatch(/\*\*verify-heavy\*\*/i)
  })

  it("route decision binds direct to @default-executor or a specialist", () => {
    expect(prompt).toMatch(/@default-executor/i)
  })

  it("includes a 'Self-Correction on Guard Block' section", () => {
    expect(prompt).toMatch(/##\s*Self-Correction on Guard Block/i)
  })

  it("self-correction says to mention an agent immediately when blocked", () => {
    expect(prompt).toMatch(/immediately mention the appropriate agent/i)
    expect(prompt).toMatch(/never report "blocked"/i)
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
    expect(prompt).toMatch(/stop and report to the human/i)
  })
})

describe("orchestrator prompt: routing decision log", () => {
  const prompt = buildOrchestratorPrompt()

  it("requires a 'Routing Decision' log format", () => {
    expect(prompt).toContain("Routing Decision")
  })

  it("requires 'Request' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Request:\*\*/)
  })

  it("requires 'Clarity' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Clarity:\*\*/)
  })

  it("requires 'Scope' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Scope:\*\*/)
  })

  it("requires 'Workflow Selected' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Workflow Selected:\*\*/)
  })

  it("requires 'Reason' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Reason:\*\*/)
  })

  it("requires 'Execution Path' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Execution Path:\*\*/)
  })
})

describe("orchestrator prompt: allowed vs forbidden tools", () => {
  const prompt = buildOrchestratorPrompt()

  it("references auto-learner for lesson/review delegation", () => {
    expect(prompt).toMatch(/auto-learner/)
  })

  it("explicitly lists allowed tools in 'What You MAY Do Directly' section", () => {
    expect(prompt).toContain("What You MAY Do Directly")
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

  it("describes runtime handoff behavior", () => {
    expect(prompt).toMatch(/runtime performs the handoff/)
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

  it("describes escalation paths", () => {
    expect(prompt).toContain("direct → standard")
    expect(prompt).toContain("standard → verify-heavy")
    expect(prompt).toContain("direct → verify-heavy")
  })

  it("forbids orchestrator from executing even after escalation", () => {
    expect(prompt).toMatch(/You STILL do not execute the work yourself/i)
  })

  it("includes self-correction rule for orchestrator guard blocks", () => {
    expect(prompt).toContain("WHEN YOU SEE [Orchestrator Guard]")
    expect(prompt).toContain("Do NOT report \"blocked\"")
    expect(prompt).toMatch(/Mention the appropriate agent/i)
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

  it("token optimization section appears before the 'Evaluate First' section", () => {
    const tokenIndex = prompt.indexOf("## Token Optimization")
    const evaluateIndex = prompt.indexOf("## Evaluate First, Always")
    expect(tokenIndex).toBeGreaterThan(-1)
    expect(evaluateIndex).toBeGreaterThan(-1)
    expect(tokenIndex).toBeLessThan(evaluateIndex)
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

  it("excludes disabled agents from the Available Agents section", () => {
    const disabled = new Set(["default-executor", "backend-coder"])
    const prompt = buildOrchestratorPrompt(disabled)
    // The core prompt references @default-executor in workflow tables,
    // but it should be excluded from the Available Agents delegation section.
    const delegationSection = prompt.split("<Delegation>")[1] ?? ""
    expect(delegationSection).not.toContain("@default-executor")
    expect(delegationSection).not.toContain("@backend-coder")
  })

  it("includes non-disabled agents in the Available Agents section", () => {
    const disabled = new Set(["default-executor"])
    const prompt = buildOrchestratorPrompt(disabled)
    const delegationSection = prompt.split("<Delegation>")[1] ?? ""
    expect(delegationSection).not.toContain("@default-executor")
    expect(delegationSection).toContain("@backend-coder")
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
    expect(agent.config.prompt).toContain("You Are a Router, Not a Worker")
    expect(agent.config.prompt).toMatch(/##\s*Evaluate First, Always/i)
    expect(agent.config.prompt).toMatch(/##\s*Discuss Gate/i)
    expect(agent.config.prompt).toMatch(/##\s*Route Decision/i)
    expect(agent.config.prompt).toMatch(/##\s*Self-Correction on Guard Block/i)
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
