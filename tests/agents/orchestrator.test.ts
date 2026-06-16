/**
 * Orchestrator Agent Tests
 *
 * Covers:
 * - Orchestrator prompt enforces routing-first behavior
 * - Orchestrator prompt forbids direct execution
 * - Orchestrator prompt requires workflow selection before execution
 * - Orchestrator prompt includes explicit execution paths
 * - Orchestrator prompt includes default-executor routing
 * - buildOrchestratorPrompt includes/excludes agents correctly
 * - createOrchestratorAgent produces valid definition
 */

import { describe, it, expect } from "vitest"
import {
  buildOrchestratorPrompt,
  createOrchestratorAgent,
} from "@/agents/orchestrator"

describe("orchestrator prompt: routing enforcement", () => {
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
    expect(prompt).toMatch(/Implement code/i)
    expect(prompt).toContain("NEVER")
  })

  it("forbids running the full coding workflow itself", () => {
    expect(prompt).toMatch(/Run the entire coding workflow yourself/i)
    expect(prompt).toContain("NEVER")
  })

  it("includes a mandatory 'Routing-First Protocol' section", () => {
    expect(prompt).toContain("Routing-First Protocol")
  })

  it("requires analyzing before routing", () => {
    expect(prompt).toMatch(/Step 1:\s*Analyze/i)
  })

  it("requires classifying before routing", () => {
    expect(prompt).toMatch(/Step 2:\s*Classify/i)
  })

  it("requires choosing workflow before routing", () => {
    expect(prompt).toMatch(/Step 3:\s*Choose Workflow/i)
  })

  it("requires logging the decision before execution", () => {
    expect(prompt).toMatch(/Step 4:\s*Log the Decision/i)
  })

  it("requires routing and supervising as step 5", () => {
    expect(prompt).toMatch(/Step 5:\s*Route and Supervise/i)
  })
})

describe("orchestrator prompt: execution paths", () => {
  const prompt = buildOrchestratorPrompt()

  it("references @default-executor for direct execution", () => {
    expect(prompt).toContain("@default-executor")
  })

  it("includes 'direct-stock-tools' mode", () => {
    expect(prompt).toContain("direct-stock-tools")
  })

  it("includes 'quick-answer' mode", () => {
    expect(prompt).toContain("quick-answer")
  })

  it("includes 'inspect-only' mode", () => {
    expect(prompt).toContain("inspect-only")
  })

  it("includes 'simple-edit' mode", () => {
    expect(prompt).toContain("simple-edit")
  })

  it("lists quick workflow class with @default-executor path", () => {
    expect(prompt).toMatch(/quick.*default-executor.*direct-stock-tools/i)
  })

  it("lists docs-only workflow class with @default-executor path", () => {
    expect(prompt).toMatch(/docs-only.*default-executor/i)
  })
})

describe("orchestrator prompt: allowed vs forbidden tools", () => {
  const prompt = buildOrchestratorPrompt()

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

describe("orchestrator prompt: workflow selection logging", () => {
  const prompt = buildOrchestratorPrompt()

  it("requires a 'Routing Decision' log format", () => {
    expect(prompt).toContain("Routing Decision")
  })

  it("requires 'Request' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Request:\*\*/)
  })

  it("requires 'Classification' field in routing log", () => {
    expect(prompt).toMatch(/\*\*Classification:\*\*/)
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

describe("orchestrator prompt: escalation behavior", () => {
  const prompt = buildOrchestratorPrompt()

  it("describes escalation paths", () => {
    expect(prompt).toContain("quick → standard")
    expect(prompt).toContain("standard → verify-heavy")
    expect(prompt).toContain("standard → ui-heavy")
    expect(prompt).toContain("explore → standard")
  })

  it("forbids orchestrator from executing even after escalation", () => {
    expect(prompt).toMatch(/You STILL do not execute the work yourself/i)
  })

  it("includes self-correction rule for orchestrator guard blocks", () => {
    expect(prompt).toContain("WHEN YOU SEE [Orchestrator Guard]")
    expect(prompt).toContain("Do NOT report \"blocked\"")
    expect(prompt).toContain("Mention @agent immediately")
  })

  it("includes background agent parallel execution guidance", () => {
    expect(prompt).toContain("Parallel execution with background agents")
    expect(prompt).toContain("background-agent")
    expect(prompt).toContain("check-background-agent")
  })

  it("includes tmux visibility guidance", () => {
    expect(prompt).toContain("tmux-watch")
    expect(prompt).toContain("tmux-dashboard")
  })
})

describe("orchestrator prompt: runtime tool selection policy", () => {
  const prompt = buildOrchestratorPrompt()

  it("mentions the runtime ContextIngressService and tool-selection-policy", () => {
    expect(prompt).toContain("ContextIngressService")
    expect(prompt).toContain("tool-selection-policy")
  })

  it("prefers codegraph MCP for code graph / impact / call tracing", () => {
    expect(prompt).toMatch(/codegraph/i)
    expect(prompt).toMatch(/grep_app/i)
  })

  it("prefers token-optimizer for token-sensitive reading", () => {
    expect(prompt).toMatch(/token-optimizer/i)
    expect(prompt).toMatch(/token-sensitive/i)
  })

  it("describes the fallback chain (preferred → grep_app → default)", () => {
    expect(prompt).toMatch(/fall\s*back/i)
  })

  it("mentions FLOWDECK_DISABLE_MCP for runtime opt-out", () => {
    expect(prompt).toContain("FLOWDECK_DISABLE_MCP")
  })
})

describe("orchestrator prompt: runtime intent classification (no overclaim)", () => {
  const prompt = buildOrchestratorPrompt()

  it("documents the deterministic intent priority order", () => {
    expect(prompt).toContain("web_research")
    expect(prompt).toContain("library_docs")
    expect(prompt).toContain("code_graph_understanding")
    expect(prompt).toContain("token_sensitive_reading")
    expect(prompt).toContain("general")
  })

  it("conditions web research routing on the web_research classification", () => {
    // The phrase "only when classified as" must appear, otherwise the
    // orchestrator will overclaim web-research routing for any task.
    expect(prompt).toMatch(/only when classified as.*web_research/i)
  })

  it("conditions library-docs routing on the library_docs classification", () => {
    expect(prompt).toMatch(/only when classified as.*library_docs/i)
  })

  it("tells the orchestrator not to overclaim runtime intent routing", () => {
    expect(prompt).toMatch(/do(es)? not overclaim/i)
  })
})

describe("orchestrator prompt: persistence surfaces", () => {
  const prompt = buildOrchestratorPrompt()

  it("identifies .codebase/DECISIONS.jsonl as the only live production persistence surface", () => {
    // The runtime writes only DECISIONS.jsonl via the decision-trace hook
    // and the decision-trace tool. The prompt must say so explicitly.
    expect(prompt).toContain("DECISIONS.jsonl")
    expect(prompt).toMatch(/only live production persistence surface.*DECISIONS\.jsonl/i)
  })

  it("does not overclaim WORKFLOW_ROUTING.jsonl as a live production persistence surface", () => {
    // No production runtime path currently calls
    // `workflow-router.logRoutingDecision`. The prompt must not state that
    // routing decisions are persisted to .codebase/WORKFLOW_ROUTING.jsonl as
    // if that path is wired up — only DECISIONS.jsonl is a live surface.
    expect(prompt).not.toMatch(/routing decisions are persisted to.*WORKFLOW_ROUTING\.jsonl/i)
    expect(prompt).not.toMatch(/persisted to .*WORKFLOW_ROUTING\.jsonl/i)
  })

  it("acknowledges logRoutingDecision as an unwired helper (not a live surface)", () => {
    // The helper still exists; the prompt may reference it for accuracy,
    // but only as an unwired helper, not as a live production surface.
    expect(prompt).toContain("WORKFLOW_ROUTING.jsonl")
    expect(prompt).toContain("logRoutingDecision")
  })

  it("does not claim an alternate routingReason field that does not exist", () => {
    // The old text claimed the field name `routingReason` lived in
    // WORKFLOW_ROUTING.jsonl. The current implementation logs the whole
    // decision object (route + escalation history + skipped stages). The
    // prompt must not assert a field name that isn't part of the schema.
    expect(prompt).not.toMatch(/routingReason/)
  })
})

describe("orchestrator prompt: canonical planning paths", () => {
  const prompt = buildOrchestratorPrompt()

  it("documents the canonical plan resolution order", () => {
    expect(prompt).toContain(".planning/STATE.md")
    expect(prompt).toMatch(/state\.plan_file/)
    expect(prompt).toMatch(/phases\/phase-/)
  })

  it("mentions the legacy .planning/PLAN.md fallback", () => {
    expect(prompt).toMatch(/\.planning\/PLAN\.md/)
  })

  it("includes the discussion-gate heuristic policy", () => {
    expect(prompt).toMatch(/Discussion Gate Heuristic/i)
    expect(prompt).toMatch(/blast radius/i)
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
    const prompt = buildOrchestratorPrompt(undefined, "quick")
    expect(prompt).toContain("Active workflow class: quick")
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

  it("includes the routing-first prompt", () => {
    const agent = createOrchestratorAgent()
    expect(agent.config.prompt).toContain("You Are a Router, Not a Worker")
    expect(agent.config.prompt).toContain("Routing-First Protocol")
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
