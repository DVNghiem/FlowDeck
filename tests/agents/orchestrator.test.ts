/**
 * Orchestrator Agent Tests
 *
 * Covers:
 * - Orchestrator prompt enforces the single fd-task → … → fd-done pipeline
 * - Orchestrator prompt states the write-permission boundary
 * - Orchestrator prompt includes the stage → agent mapping
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

  it("declares the coordinate-and-delegate role", () => {
    expect(prompt).toContain(
      "You coordinate the pipeline and delegate work to specialist agents",
    )
  })

  it("names the write-permission boundary explicitly", () => {
    expect(prompt).toContain("## Write Permission Rules")
    expect(prompt).toContain("You MAY write directly (no delegation)")
    expect(prompt).toContain("You MUST delegate to subagents")
  })

  it("allows direct writes only under ~/.fd-plan/", () => {
    expect(prompt).toMatch(/Any file under `~\/\.fd-plan\/`/)
    expect(prompt).toContain(
      'Self-check before any write: "Is this a planning artifact under ~/.fd-plan/?"',
    )
  })

  it("requires delegation for source, config, and test files", () => {
    expect(prompt).toMatch(/Source code files/)
    expect(prompt).toMatch(/Project config files/)
    expect(prompt).toContain("Test files")
  })
})

describe("orchestrator prompt: pipeline", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes a 'Pipeline' section", () => {
    expect(prompt).toMatch(/##\s*Pipeline/i)
  })

  it("names every stage in order", () => {
    expect(prompt).toContain("fd-task → fd-review → fd-execute → fd-verify → fd-done")
  })

  it("forbids skipping stages and inventing alternative paths", () => {
    expect(prompt).toContain("Never skip stages")
    expect(prompt).toContain("Never invent alternative paths")
  })

  it("documents the trivial-task shortcut and its logging requirement", () => {
    expect(prompt).toContain("fd-task → fd-execute → fd-done")
    expect(prompt).toMatch(/log reason for skipping fd-review and fd-verify/)
  })

  it("pipeline says to call task tool immediately after routing", () => {
    expect(prompt).toMatch(/Call `task` tool immediately/)
  })
})

describe("orchestrator prompt: pre-flight", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes a 'Pre-flight' section that runs before every task", () => {
    expect(prompt).toMatch(/##\s*Pre-flight \(runs before EVERY task\)/i)
  })

  it("checks the global plan directory rather than in-repo state", () => {
    // Scope to the orchestrator's own instructions — the appended agent
    // directory carries each agent's own description verbatim.
    const body = prompt.split("## Routing → Runtime Handoff")[0] ?? ""
    expect(body).toContain("~/.fd-plan/<project-slug>/")
    expect(body).not.toContain(".planning/")
    expect(body).not.toContain(".codebase/")
  })

  it("delegates codebase mapping to @mapper", () => {
    expect(prompt).toContain("Delegate codebase mapping to @mapper")
  })

  it("loads context via load-rules and repo-memory", () => {
    expect(prompt).toMatch(/Load context via `load-rules` and `repo-memory action:search`/)
  })
})

describe("orchestrator prompt: stage → agent mapping", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes the stage → agent mapping table", () => {
    expect(prompt).toMatch(/##\s*Stage → Agent Mapping/i)
  })

  it("maps fd-task to researcher, architect, and planner", () => {
    expect(prompt).toMatch(/fd-task\s*\|\s*@researcher, @architect \(parallel\), @planner/)
  })

  it("maps fd-review to reviewer and security-auditor", () => {
    expect(prompt).toMatch(/fd-review\s*\|\s*@reviewer, @security-auditor/)
  })

  it("maps fd-execute to the coder agents", () => {
    expect(prompt).toMatch(/fd-execute\s*\|\s*@backend-coder \/ @frontend-coder \/ @devops/)
  })

  it("maps fd-verify to tester and reviewer", () => {
    expect(prompt).toMatch(/fd-verify\s*\|\s*@tester, @reviewer/)
  })

  it("keeps fd-done with the orchestrator itself", () => {
    expect(prompt).toMatch(/fd-done\s*\|\s*orchestrator directly \(git commit \+ push\)/)
  })
})

describe("orchestrator prompt: approval gates and checkpoint", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes an 'Approval Gates' section", () => {
    expect(prompt).toMatch(/##\s*Approval Gates/i)
  })

  it("gates on human CONFIRM after fd-task and fd-review", () => {
    expect(prompt).toContain("Pause and wait for human CONFIRM at:")
    expect(prompt).toMatch(/End of fd-task — before saving artifacts to ~\/\.fd-plan\//)
    expect(prompt).toMatch(/End of fd-review — before proceeding to fd-execute/)
  })

  it("includes a 'Context Packet' section capped at 400 tokens", () => {
    expect(prompt).toMatch(/##\s*Context Packet/i)
    expect(prompt).toContain("## Orchestrator Context")
    expect(prompt).toContain("Keep under 400 tokens")
  })

  it("writes checkpoint.json after each stage", () => {
    expect(prompt).toMatch(/##\s*Checkpoint/i)
    expect(prompt).toMatch(/~\/\.fd-plan\/<project-slug>\/checkpoint\.json/)
    expect(prompt).toContain("current_command")
    expect(prompt).toContain("current_stage")
  })
})

describe("orchestrator prompt: failure handling", () => {
  const prompt = buildOrchestratorPrompt()

  it("includes a 'Failure Handling' section", () => {
    expect(prompt).toMatch(/##\s*Failure Handling/i)
  })

  it("escalates retry once → different agent → stop", () => {
    expect(prompt).toMatch(/retry once with more specific context/i)
    expect(prompt).toMatch(/try a different agent/i)
    expect(prompt).toMatch(/STOP and report to human/i)
  })

  it("captures a lesson on repeated failures", () => {
    expect(prompt).toMatch(/Call `capture-lesson` on repeated failures/)
  })

  it("prints a block report pointing at /fd-resume", () => {
    expect(prompt).toContain("Blocked at:")
    expect(prompt).toContain("To resume:  /fd-resume")
  })
})

describe("orchestrator prompt: allowed vs forbidden tools", () => {
  const prompt = buildOrchestratorPrompt()

  it("lists read tools in the 'Tool Permissions' section", () => {
    expect(prompt).toMatch(/##\s*Tool Permissions/i)
    expect(prompt).toContain("Read tools (use directly)")
  })

  it("allows fdx read/search tools", () => {
    expect(prompt).toContain("fdx-read")
    expect(prompt).toContain("fdx-grep")
    expect(prompt).toContain("fdx-search")
    expect(prompt).toContain("fdx-graph")
  })

  it("no longer lists codegraph", () => {
    // The guard hook still PERMITS codegraph (it is an allowlist, deliberately
    // untouched). The orchestrator simply stops being told to prefer it.
    expect(prompt).not.toMatch(/codegraph/i)
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

  it("allows the task tool for delegation", () => {
    expect(prompt).toContain("`task`")
  })

  it("allows read-only shell inspection", () => {
    expect(prompt).toMatch(/Shell read-only via bash: `ls`, `cat`, `find`, `git status`, `git log` — allowed/)
  })

  it("forbids mutating bash", () => {
    expect(prompt).toContain("Mutating bash: NOT allowed (delegate to subagents)")
  })
})

describe("orchestrator prompt: Graph Usage section", () => {
  const prompt = buildOrchestratorPrompt()

  it("has a Graph Usage section", () => {
    expect(prompt).toContain("## Graph Usage")
  })

  it("documents all 8 graph actions", () => {
    for (const action of [
      "build",
      "status",
      "query",
      "impact",
      "deps",
      "path",
      "explain",
      "report",
    ]) {
      expect(prompt).toContain(`| ${action}`)
    }
  })

  it("documents the real arg names and denies the non-existent ones", () => {
    // The CLI is `fdx graph [--format F] <ACTION> [TARGET] [TARGET2]`. An earlier
    // draft documented symbol:/file:/depth:/project_root:; every graph call an
    // agent wrote from that table would have thrown.
    expect(prompt).toContain("`target` is the symbol name or file path")
    expect(prompt).toContain("`target2` is the destination")
    expect(prompt).toContain("There is no depth or\nproject-root argument")
    expect(prompt).not.toMatch(/fdx-graph[^\n]{0,80}\b(symbol|depth|project_root):/)
  })

  it("names the orchestrator as the single writer for action:build", () => {
    expect(prompt).toMatch(/only YOU run `action:build`/)
    expect(prompt).toContain("Subagents use read actions only")
    // The reason matters: without it, a future editor may "helpfully" delegate
    // builds into a wave and reintroduce the silent grep fallback.
    expect(prompt).toContain("does not wait on contention")
  })

  it("states the priority over fdx-search and fdx-grep", () => {
    expect(prompt).toContain("`action:query` before `fdx-search`")
    expect(prompt).toContain("`action:impact` before `fdx-grep`")
  })

  it("points the context packet's blast radius at the graph", () => {
    expect(prompt).toContain("Blast radius: <from fdx-graph action:impact")
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

describe("orchestrator prompt: no references to removed concepts", () => {
  const prompt = buildOrchestratorPrompt()

  it("does not classify tasks into workflow classes", () => {
    expect(prompt).not.toMatch(/workflow class/i)
    expect(prompt).not.toMatch(/workflowClass/)
  })

  it("does not reference the deleted supervisor preflight", () => {
    expect(prompt).not.toMatch(/supervisor/i)
  })

  it.each([
    "@design",
    "@writer",
    "@supervisor",
    "@policy-enforcer",
    "@default-executor",
    "@doc-updater",
    "@auto-learner",
    "@task-splitter",
    "@plan-checker",
    "@discusser",
    "@risk-analyst",
    "@performance-optimizer",
    "@refactor-guide",
    "@explorer",
    "@shipper",
  ])("does not reference the deleted agent %s", (agent) => {
    expect(prompt).not.toContain(agent)
  })

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

describe("buildOrchestratorPrompt: agent filtering", () => {
  it("includes @mapper when not disabled", () => {
    const prompt = buildOrchestratorPrompt()
    expect(prompt).toContain("@mapper")
  })

  it("marks disabled agents in the Available Agents section", () => {
    const disabled = new Set(["mapper", "backend-coder"])
    const prompt = buildOrchestratorPrompt(disabled)
    const delegationSection = prompt.split("<Delegation>")[1] ?? ""
    expect(delegationSection).toContain("@mapper (disabled for current stage)")
    expect(delegationSection).toContain("@backend-coder (disabled for current stage)")
  })

  it("includes non-disabled agents without disabled hint", () => {
    const disabled = new Set(["mapper"])
    const prompt = buildOrchestratorPrompt(disabled)
    const delegationSection = prompt.split("<Delegation>")[1] ?? ""
    expect(delegationSection).toContain("@mapper (disabled for current stage)")
    expect(delegationSection).toContain("@backend-coder")
    expect(delegationSection).not.toContain("@backend-coder (disabled")
    expect(delegationSection).toContain("@frontend-coder")
  })

  it("declares the single pipeline and forbids alternative paths", () => {
    const prompt = buildOrchestratorPrompt()
    expect(prompt).toContain("fd-task → fd-review → fd-execute → fd-verify → fd-done")
    expect(prompt).toContain("Never skip stages")
    expect(prompt).toContain("Never invent alternative paths")
  })

  it("allows the trivial-task shortcut with a logged reason", () => {
    const prompt = buildOrchestratorPrompt()
    expect(prompt).toContain("fd-task → fd-execute → fd-done")
    expect(prompt).toMatch(/log reason for skipping/)
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

  it("includes the core pipeline sections", () => {
    const agent = createOrchestratorAgent()
    expect(agent.config.prompt).toContain(
      "You coordinate the pipeline and delegate work to specialist agents",
    )
    expect(agent.config.prompt).toMatch(/##\s*Pipeline/i)
    expect(agent.config.prompt).toMatch(/##\s*Write Permission Rules/i)
    expect(agent.config.prompt).toMatch(/##\s*Stage → Agent Mapping/i)
    expect(agent.config.prompt).toMatch(/##\s*Failure Handling/i)
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
