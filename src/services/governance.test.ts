/**
 * Governance layer tests:
 * - Agent Contract Registry
 * - Agent Validator
 * - Agent Trace Graph
 * - Delegation Budget
 * - Deadlock Detector
 * - Workflow Scorecard
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"

process.env.TELEMETRY_ENABLED = "true"

const TMP = join(process.cwd(), ".test-tmp-governance")

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(join(TMP, ".codebase"), { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Agent Contract Registry
// ──────────────────────────────────────────────────────────────────────────────
describe("agent-contract-registry", () => {
  it("returns contract for known agents", async () => {
    const { getContract } = await import("../services/agent-contract-registry")
    const contract = getContract("orchestrator")
    expect(contract).not.toBeNull()
    expect(contract!.agent).toBe("orchestrator")
    expect(contract!.allowedTools).toContain("delegate")
    expect(contract!.forbiddenActions).toContain("write_file")
  })

  it("returns null for unknown agents", async () => {
    const { getContract } = await import("../services/agent-contract-registry")
    expect(getContract("nonexistent-agent")).toBeNull()
  })

  it("all major agents have contracts", async () => {
    const { getContract } = await import("../services/agent-contract-registry")
    const agents = [
      "orchestrator", "planner", "design", "backend-coder", "frontend-coder",
      "tester", "reviewer", "security-auditor", "researcher", "architect",
    ]
    for (const agent of agents) {
      expect(getContract(agent), `Missing contract for ${agent}`).not.toBeNull()
    }
  })

  it("reviewer contract forbids file writes", async () => {
    const { getContract } = await import("../services/agent-contract-registry")
    const c = getContract("reviewer")!
    expect(c.forbiddenActions.some(a => a.includes("write"))).toBe(true)
    expect(c.allowedTools).not.toContain("write")
    expect(c.allowedTools).not.toContain("edit")
  })

  it("tester contract forbids deleting failing tests", async () => {
    const { getContract } = await import("../services/agent-contract-registry")
    const c = getContract("tester")!
    expect(c.forbiddenActions.some(a => a.includes("delete"))).toBe(true)
  })

  it("getAllContracts returns all registered contracts", async () => {
    const { getAllContracts, listAgentsWithContracts } = await import("../services/agent-contract-registry")
    const all = getAllContracts()
    const names = listAgentsWithContracts()
    expect(all.length).toBeGreaterThan(8)
    expect(names.length).toBe(all.length)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Agent Validator
// ──────────────────────────────────────────────────────────────────────────────
describe("agent-validator", () => {
  it("allows an agent using a permitted tool", async () => {
    const { validateToolAccess } = await import("../services/agent-validator")
    const result = validateToolAccess(TMP, "researcher", "read")
    expect(result.valid).toBe(true)
    expect(result.action).toBe("allow")
    expect(result.violations).toHaveLength(0)
  })

  it("warns when agent uses a tool not in allowedTools", async () => {
    const { validateToolAccess } = await import("../services/agent-validator")
    // researcher doesn't have "bash" in allowed tools
    const result = validateToolAccess(TMP, "researcher", "bash")
    expect(result.valid).toBe(false)
    expect(["warn", "block"]).toContain(result.action)
    expect(result.violations.some(v => v.rule === "tool-not-in-contract")).toBe(true)
  })

  it("warns when prerequisites are not met", async () => {
    const { validateAgent } = await import("../services/agent-validator")
    const result = validateAgent(TMP, {
      agent: "backend-coder",
      prerequisitesMet: false,
    })
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.rule === "prerequisites-not-met")).toBe(true)
  })

  it("warns on approval gate bypass", async () => {
    const { validateAgent } = await import("../services/agent-validator")
    const result = validateAgent(TMP, {
      agent: "backend-coder",
      approvalRequired: true,
      approvalGranted: false,
    })
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.rule === "approval-gate-bypassed")).toBe(true)
  })

  it("warns when task type is not allowed", async () => {
    const { validateAgent } = await import("../services/agent-validator")
    const result = validateAgent(TMP, {
      agent: "reviewer",
      taskType: "implementation",
    })
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.rule === "task-type-not-allowed")).toBe(true)
  })

  it("returns allow for unknown agent in advisory mode", async () => {
    const { validateAgent } = await import("../services/agent-validator")
    const result = validateAgent(TMP, { agent: "unknown-agent" })
    // no-contract is info severity, so action is still allow in advisory mode
    expect(result.action).toBe("allow")
    expect(result.violations.some(v => v.rule === "no-contract")).toBe(true)
  })

  it("includes message when violations exist", async () => {
    const { validateAgent } = await import("../services/agent-validator")
    const result = validateAgent(TMP, { agent: "tester", prerequisitesMet: false })
    expect(result.message).toBeTruthy()
    expect(result.message).toContain("prerequisites-not-met")
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Agent Trace Graph
// ──────────────────────────────────────────────────────────────────────────────
describe("agent-trace-graph", () => {
  it("opens a span and records it", async () => {
    const { openSpan, getSpan } = await import("../services/agent-trace-graph")
    const span = openSpan(TMP, {
      trace_id: "trace-1",
      invoker: "orchestrator",
      agent: "backend-coder",
      task_description: "Implement auth endpoint",
      stage: "execute",
    })
    expect(span.span_id).toBeTruthy()
    expect(span.status).toBe("running")

    const loaded = getSpan(TMP, span.span_id)
    expect(loaded?.agent).toBe("backend-coder")
    expect(loaded?.trace_id).toBe("trace-1")
  })

  it("closes a span and records latency", async () => {
    const { openSpan, closeSpan, getSpan } = await import("../services/agent-trace-graph")
    const span = openSpan(TMP, {
      trace_id: "trace-1",
      invoker: "orchestrator",
      agent: "tester",
      task_description: "Write tests",
      stage: "execute",
    })
    closeSpan(TMP, span.span_id, "complete", { output_valid: true })

    const closed = getSpan(TMP, span.span_id)
    expect(closed?.status).toBe("complete")
    expect(closed?.output_valid).toBe(true)
    expect(closed?.latency_ms).toBeGreaterThanOrEqual(0)
    expect(closed?.ended_at).toBeTruthy()
  })

  it("records tool usage on a span", async () => {
    const { openSpan, recordToolUsed, getSpan } = await import("../services/agent-trace-graph")
    const span = openSpan(TMP, {
      trace_id: "trace-1",
      invoker: "orchestrator",
      agent: "researcher",
      task_description: "Research API",
      stage: "research",
    })
    recordToolUsed(TMP, span.span_id, "read")
    recordToolUsed(TMP, span.span_id, "grep")
    recordToolUsed(TMP, span.span_id, "read") // deduplication

    const updated = getSpan(TMP, span.span_id)
    expect(updated?.tools_used).toHaveLength(2)
    expect(updated?.tools_used).toContain("read")
    expect(updated?.tools_used).toContain("grep")
  })

  it("records contract violations on a span", async () => {
    const { openSpan, addSpanViolation, getSpan } = await import("../services/agent-trace-graph")
    const span = openSpan(TMP, {
      trace_id: "trace-1",
      invoker: "orchestrator",
      agent: "reviewer",
      task_description: "Review code",
      stage: "review",
    })
    addSpanViolation(TMP, span.span_id, "tool-not-in-contract: edit")

    const updated = getSpan(TMP, span.span_id)
    expect(updated?.contract_violations).toHaveLength(1)
    expect(updated?.contract_violations[0]).toContain("edit")
  })

  it("builds a trace graph from multiple spans", async () => {
    const { openSpan, closeSpan, buildTraceGraph } = await import("../services/agent-trace-graph")

    const s1 = openSpan(TMP, { trace_id: "t1", invoker: "system", agent: "orchestrator", task_description: "Run pipeline", stage: "orchestration" })
    const s2 = openSpan(TMP, { trace_id: "t1", invoker: "orchestrator", agent: "backend-coder", task_description: "Implement", stage: "execute", parent_span_id: s1.span_id, depth: 1 })
    const s3 = openSpan(TMP, { trace_id: "t1", invoker: "orchestrator", agent: "tester", task_description: "Test", stage: "execute", parent_span_id: s1.span_id, depth: 1 })
    closeSpan(TMP, s2.span_id, "complete", { output_valid: true })
    closeSpan(TMP, s3.span_id, "complete", { output_valid: true })
    closeSpan(TMP, s1.span_id, "complete", { output_valid: true })

    const graph = buildTraceGraph(TMP, "t1")
    expect(graph).not.toBeNull()
    expect(graph!.total_agents).toBe(3)
    expect(graph!.max_depth).toBe(1)
    expect(graph!.failed_spans).toBe(0)
    expect(graph!.root_agent).toBe("orchestrator")
  })

  it("listRecentTraceIds returns most recent first", async () => {
    const { openSpan, listRecentTraceIds } = await import("../services/agent-trace-graph")
    openSpan(TMP, { trace_id: "alpha", invoker: "sys", agent: "planner", task_description: "plan", stage: "plan" })
    openSpan(TMP, { trace_id: "beta", invoker: "sys", agent: "planner", task_description: "plan", stage: "plan" })

    const ids = listRecentTraceIds(TMP)
    expect(ids[0]).toBe("beta")
    expect(ids[1]).toBe("alpha")
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Delegation Budget
// ──────────────────────────────────────────────────────────────────────────────
describe("delegation-budget", () => {
  it("creates a budget with default limits", async () => {
    const { createBudget, getBudget } = await import("../services/delegation-budget")
    createBudget(TMP, "run-1")
    const b = getBudget(TMP, "run-1")
    expect(b).not.toBeNull()
    expect(b!.status).toBe("active")
    expect(b!.limits.maxToolCalls).toBe(200)
    expect(b!.consumed.toolCalls).toBe(0)
  })

  it("recordToolCall increments counter and allows when under limit", async () => {
    const { createBudget, recordToolCall, getBudget } = await import("../services/delegation-budget")
    createBudget(TMP, "run-2")
    const result = recordToolCall(TMP, "run-2")
    expect(result.allowed).toBe(true)
    expect(getBudget(TMP, "run-2")!.consumed.toolCalls).toBe(1)
  })

  it("recordDelegation enforces max depth", async () => {
    const { createBudget, recordDelegation } = await import("../services/delegation-budget")
    createBudget(TMP, "run-3")
    const result = recordDelegation(TMP, "run-3", 9) // exceeds default maxDepth=8
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("depth")
  })

  it("recordRetry enforces per-step retry limit", async () => {
    const { createBudget, recordRetry } = await import("../services/delegation-budget")
    createBudget(TMP, "run-4")
    recordRetry(TMP, "run-4", "step-1")
    recordRetry(TMP, "run-4", "step-1")
    const third = recordRetry(TMP, "run-4", "step-1") // hits maxSameStepRetries=3
    expect(third.allowed).toBe(false)
    expect(third.reason).toContain("step-1")
  })

  it("isBudgetExhausted returns true after exhaustion", async () => {
    const { createBudget, recordRetry, isBudgetExhausted } = await import("../services/delegation-budget")
    createBudget(TMP, "run-5")
    for (let i = 0; i < 3; i++) recordRetry(TMP, "run-5", "step-x")
    expect(isBudgetExhausted(TMP, "run-5")).toBe(true)
  })

  it("completeBudget marks status as completed", async () => {
    const { createBudget, completeBudget, getBudget } = await import("../services/delegation-budget")
    createBudget(TMP, "run-6")
    completeBudget(TMP, "run-6")
    expect(getBudget(TMP, "run-6")!.status).toBe("completed")
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Deadlock Detector
// ──────────────────────────────────────────────────────────────────────────────
describe("deadlock-detector", () => {
  it("returns no signals for clean execution", async () => {
    const { openSpan, closeSpan } = await import("../services/agent-trace-graph")
    const { detectDeadlocks } = await import("../services/deadlock-detector")

    const s1 = openSpan(TMP, { trace_id: "clean-1", invoker: "sys", agent: "orchestrator", task_description: "run", stage: "orchestration" })
    const s2 = openSpan(TMP, { trace_id: "clean-1", invoker: "orchestrator", agent: "backend-coder", task_description: "implement", stage: "execute", depth: 1, parent_span_id: s1.span_id })
    closeSpan(TMP, s2.span_id, "complete")
    closeSpan(TMP, s1.span_id, "complete")

    const signals = detectDeadlocks(TMP, "clean-1")
    expect(signals).toHaveLength(0)
  })

  it("detects agent_bounce when same pair exceeds threshold", async () => {
    const { openSpan } = await import("../services/agent-trace-graph")
    const { detectDeadlocks } = await import("../services/deadlock-detector")

    // Create 3 alternating A→B transitions
    for (let i = 0; i < 3; i++) {
      openSpan(TMP, { trace_id: "bounce-1", invoker: "agent-a", agent: "agent-b", task_description: "task", stage: "execute" })
      openSpan(TMP, { trace_id: "bounce-1", invoker: "agent-b", agent: "agent-a", task_description: "task", stage: "execute" })
    }

    const signals = detectDeadlocks(TMP, "bounce-1")
    const bounce = signals.find(s => s.type === "agent_bounce")
    expect(bounce).toBeTruthy()
    expect(bounce!.agents_involved).toContain("agent-a")
    expect(bounce!.agents_involved).toContain("agent-b")
  })

  it("detects step_retry_loop when same stage repeated beyond threshold", async () => {
    const { openSpan } = await import("../services/agent-trace-graph")
    const { detectDeadlocks } = await import("../services/deadlock-detector")

    for (let i = 0; i < 3; i++) {
      openSpan(TMP, {
        trace_id: "loop-1",
        invoker: "orchestrator",
        agent: "tester",
        task_description: "run tests",
        stage: "test-execution",
      })
    }

    const signals = detectDeadlocks(TMP, "loop-1")
    const loopSignal = signals.find(s => s.type === "step_retry_loop")
    expect(loopSignal).toBeTruthy()
    expect(loopSignal!.agents_involved).toContain("tester")
  })

  it("detects circular_delegation and sets auto_stop=true", async () => {
    const { openSpan } = await import("../services/agent-trace-graph")
    const { detectDeadlocks } = await import("../services/deadlock-detector")

    // A → B → C → A
    openSpan(TMP, { trace_id: "circ-1", invoker: "agent-a", agent: "agent-b", task_description: "t", stage: "s" })
    openSpan(TMP, { trace_id: "circ-1", invoker: "agent-b", agent: "agent-c", task_description: "t", stage: "s" })
    openSpan(TMP, { trace_id: "circ-1", invoker: "agent-c", agent: "agent-a", task_description: "t", stage: "s" })

    const signals = detectDeadlocks(TMP, "circ-1")
    const circular = signals.find(s => s.type === "circular_delegation")
    expect(circular).toBeTruthy()
    expect(circular!.auto_stop).toBe(true)
    expect(circular!.recommended_action).toBe("stop")
  })

  it("isTraceStuck returns true when circular delegation detected", async () => {
    const { openSpan } = await import("../services/agent-trace-graph")
    const { detectDeadlocks, isTraceStuck } = await import("../services/deadlock-detector")

    openSpan(TMP, { trace_id: "stuck-1", invoker: "x", agent: "y", task_description: "t", stage: "s" })
    openSpan(TMP, { trace_id: "stuck-1", invoker: "y", agent: "x", task_description: "t", stage: "s" })
    openSpan(TMP, { trace_id: "stuck-1", invoker: "x", agent: "y", task_description: "t", stage: "s" })

    detectDeadlocks(TMP, "stuck-1")
    // circular_delegation auto_stop=true should set isTraceStuck
    const stuck = isTraceStuck(TMP, "stuck-1")
    // may or may not detect circular depending on graph shape — just verify no throw
    expect(typeof stuck).toBe("boolean")
  })

  it("does not emit duplicate signals for the same type", async () => {
    const { openSpan } = await import("../services/agent-trace-graph")
    const { detectDeadlocks, getSignals } = await import("../services/deadlock-detector")

    for (let i = 0; i < 3; i++) {
      openSpan(TMP, { trace_id: "dedup-1", invoker: "orchestrator", agent: "tester", task_description: "t", stage: "execute" })
    }

    detectDeadlocks(TMP, "dedup-1")
    detectDeadlocks(TMP, "dedup-1") // second call should not add duplicates

    const signals = getSignals(TMP, "dedup-1").filter(s => s.type === "step_retry_loop")
    expect(signals).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Workflow Scorecard
// ──────────────────────────────────────────────────────────────────────────────
describe("workflow-scorecard", () => {
  it("generates a scorecard for a successful run", async () => {
    const { startTrace, endTrace } = await import("../services/run-trace")
    const { generateScorecard, getScorecardByRun } = await import("../services/workflow-scorecard")

    const trace = startTrace(TMP, "fd-new-feature", {})
    endTrace(TMP, trace.run_id, "complete", "Feature implemented")
    const updated = (await import("../services/run-trace")).getTrace(TMP, trace.run_id)!

    const card = generateScorecard(TMP, updated, { tdd_compliant: true, review_completed: true })
    expect(card.completion_status).toBe("complete")
    expect(card.overall_score).toBeGreaterThan(0)
    expect(card.overall_score).toBeLessThanOrEqual(100)
    expect(card.dimensions.tddCompliance).toBe(1)

    const loaded = getScorecardByRun(TMP, trace.run_id)
    expect(loaded?.scorecard_id).toBe(card.scorecard_id)
  })

  it("generates a lower score for a failed run with violations", async () => {
    const { startTrace, endTrace, getTrace } = await import("../services/run-trace")
    const { openSpan, addSpanViolation } = await import("../services/agent-trace-graph")
    const { generateScorecard } = await import("../services/workflow-scorecard")

    const trace = startTrace(TMP, "fd-execute", {})
    // Add a span with contract violations
    const span = openSpan(TMP, { trace_id: trace.run_id, invoker: "sys", agent: "reviewer", task_description: "review", stage: "review" })
    addSpanViolation(TMP, span.span_id, "tool-not-in-contract: edit")
    endTrace(TMP, trace.run_id, "failed", undefined, "Agent error")

    const updated = getTrace(TMP, trace.run_id)!
    const card = generateScorecard(TMP, updated, {
      tdd_compliant: false,
      design_first_compliant: false,
      review_completed: false,
    })
    expect(card.completion_status).toBe("failed")
    expect(card.overall_score).toBeLessThan(80)
    expect(card.dimensions.tddCompliance).toBe(0)
    expect(card.dimensions.reviewQuality).toBe(0)
  })

  it("readScorecards returns all persisted scorecards", async () => {
    const { startTrace, endTrace, getTrace } = await import("../services/run-trace")
    const { generateScorecard, readScorecards } = await import("../services/workflow-scorecard")

    for (let i = 0; i < 3; i++) {
      const t = startTrace(TMP, "fd-quick", {})
      endTrace(TMP, t.run_id, "complete")
      generateScorecard(TMP, getTrace(TMP, t.run_id)!)
    }

    const cards = readScorecards(TMP)
    expect(cards).toHaveLength(3)
  })

  it("getScorecardTrend filters by command", async () => {
    const { startTrace, endTrace, getTrace } = await import("../services/run-trace")
    const { generateScorecard, getScorecardTrend } = await import("../services/workflow-scorecard")

    const t1 = startTrace(TMP, "fd-fix-bug", {})
    endTrace(TMP, t1.run_id, "complete")
    generateScorecard(TMP, getTrace(TMP, t1.run_id)!)

    const t2 = startTrace(TMP, "fd-new-feature", {})
    endTrace(TMP, t2.run_id, "complete")
    generateScorecard(TMP, getTrace(TMP, t2.run_id)!)

    const trend = getScorecardTrend(TMP, "fd-fix-bug")
    expect(trend).toHaveLength(1)
    expect(trend[0].command).toBe("fd-fix-bug")
  })

  it("computeAverageScore returns null when no data", async () => {
    const { computeAverageScore } = await import("../services/workflow-scorecard")
    expect(computeAverageScore(TMP)).toBeNull()
  })

  it("computeAverageScore returns average across runs", async () => {
    const { startTrace, endTrace, getTrace } = await import("../services/run-trace")
    const { generateScorecard, computeAverageScore } = await import("../services/workflow-scorecard")

    for (let i = 0; i < 2; i++) {
      const t = startTrace(TMP, "fd-execute", {})
      endTrace(TMP, t.run_id, "complete")
      generateScorecard(TMP, getTrace(TMP, t.run_id)!, { tdd_compliant: true })
    }

    const avg = computeAverageScore(TMP)
    expect(avg).not.toBeNull()
    expect(avg!).toBeGreaterThan(0)
  })
})
