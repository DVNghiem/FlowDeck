/**
 * Workflow Router Tests
 *
 * Covers:
 * - scoreTaskForRouting: correct dimension scoring
 * - buildAdaptiveStageSequence: correct workflow class and stages for each criteria
 * - shouldEscalate: correct escalation paths
 * - logRoutingDecision: appends to WORKFLOW_ROUTING.jsonl
 * - getHistoricalCompliance: averages stageCompliance from SCORECARDS.jsonl
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  scoreTaskForRouting,
  buildAdaptiveStageSequence,
  shouldEscalate,
  logRoutingDecision,
  getHistoricalCompliance,
  computeRoutingHeuristics,
  type RoutingCriteria,
  type RoutingDecision,
} from "@/services/workflow-router"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

function makeCriteria(overrides: Partial<RoutingCriteria> = {}): RoutingCriteria {
  return {
    taskType: "feature",
    complexity: "standard",
    confidence: 0.80,
    blastRadius: 2,
    isSensitive: false,
    codebaseFreshness: "fresh",
    requiresTests: true,
    ...overrides,
  }
}

// ─── scoreTaskForRouting ──────────────────────────────────────────────────────

describe("scoreTaskForRouting", () => {
  it("scores a simple cheap task with perfect confidence at 1.0", () => {
    const criteria = makeCriteria({
      taskType: "simple",
      complexity: "cheap",
      confidence: 1.0,
      blastRadius: 1,
      codebaseFreshness: "fresh",
    })
    const score = scoreTaskForRouting(criteria)
    expect(score.simplicity).toBe(0.30)
    expect(score.confidence).toBe(0.20)
    expect(score.lowRisk).toBe(0.20)
    expect(score.knownCodebase).toBe(0.15)
    expect(score.cheapComplexity).toBe(0.15)
    expect(score.total).toBeCloseTo(1.0, 5)
  })

  it("scores non-simple task at 0 for simplicity", () => {
    const criteria = makeCriteria({ taskType: "feature" })
    const score = scoreTaskForRouting(criteria)
    expect(score.simplicity).toBe(0)
  })

  it("penalizes sensitive tasks on lowRisk", () => {
    const criteria = makeCriteria({ isSensitive: true, blastRadius: 1 })
    const score = scoreTaskForRouting(criteria)
    expect(score.lowRisk).toBe(0)
  })

  it("penalizes high blastRadius on lowRisk", () => {
    const criteria = makeCriteria({ isSensitive: false, blastRadius: 5 })
    const score = scoreTaskForRouting(criteria)
    expect(score.lowRisk).toBe(0)
  })

  it("penalizes stale codebase on knownCodebase", () => {
    const criteria = makeCriteria({ codebaseFreshness: "stale" })
    const score = scoreTaskForRouting(criteria)
    expect(score.knownCodebase).toBe(0)
  })

  it("penalizes expensive complexity on cheapComplexity", () => {
    const criteria = makeCriteria({ complexity: "expensive" })
    const score = scoreTaskForRouting(criteria)
    expect(score.cheapComplexity).toBe(0)
  })
})

// ─── buildAdaptiveStageSequence ───────────────────────────────────────────────

describe("buildAdaptiveStageSequence", () => {
  it("routes simple task with high score to quick workflow", () => {
    const criteria = makeCriteria({
      taskType: "simple",
      complexity: "cheap",
      confidence: 1.0,
      blastRadius: 1,
    })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("quick")
    expect(route.stages.map(s => s.name)).toEqual(["execute", "verify"])
    expect(route.stages.every(s => s.skippable)).toBe(true)
  })

  it("routes docs task to docs-only workflow (docs cannot reach quick threshold)", () => {
    const criteria = makeCriteria({
      taskType: "docs",
      complexity: "cheap",
      confidence: 1.0,
      blastRadius: 1,
    })
    const route = buildAdaptiveStageSequence(criteria)
    // Docs tasks score max 0.70 (no simplicity bonus), so they fall through to docs-only
    expect(route.workflowClass).toBe("docs-only")
    expect(route.stages.map(s => s.name)).toEqual(["write-docs", "verify"])
  })

  it("routes bugfix task to bugfix workflow", () => {
    const criteria = makeCriteria({ taskType: "bugfix" })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("bugfix")
    expect(route.stages.map(s => s.name)).toEqual(["discuss", "fix-bug", "verify"])
  })

  it("routes docs task with low score to docs-only workflow", () => {
    const criteria = makeCriteria({
      taskType: "docs",
      complexity: "expensive",
      confidence: 0.50,
      blastRadius: 5,
    })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("docs-only")
    expect(route.stages.map(s => s.name)).toEqual(["write-docs", "verify"])
    const verifyStage = route.stages.find(s => s.name === "verify")!
    expect(verifyStage.skippable).toBe(true)
  })

  it("routes ui-feature task to ui-heavy workflow", () => {
    const criteria = makeCriteria({ taskType: "ui-feature" })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("ui-heavy")
    expect(route.stages.map(s => s.name)).toEqual([
      "discuss", "design", "plan", "execute", "verify",
    ])
    const designStage = route.stages.find(s => s.name === "design")!
    expect(designStage.command).toBe("fd-design")
    expect(designStage.args).toBe("--mode=draft")
  })

  it("routes high blastRadius to verify-heavy workflow", () => {
    const criteria = makeCriteria({ blastRadius: 6 })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("verify-heavy")
    expect(route.stages.map(s => s.name)).toEqual(["plan", "execute", "verify"])
  })

  it("routes sensitive task to verify-heavy workflow", () => {
    const criteria = makeCriteria({ isSensitive: true, blastRadius: 2 })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("verify-heavy")
  })

  it("routes low confidence to explore workflow", () => {
    const criteria = makeCriteria({ confidence: 0.50 })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("explore")
    expect(route.stages.map(s => s.name)).toEqual([
      "discuss", "plan", "execute", "verify",
    ])
  })

  it("routes ambiguous task to explore workflow", () => {
    const criteria = makeCriteria({ taskType: "ambiguous", confidence: 0.80 })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("explore")
  })

  it("routes default feature task to standard workflow", () => {
    const criteria = makeCriteria({ taskType: "feature" })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.workflowClass).toBe("standard")
    expect(route.stages.map(s => s.name)).toEqual(["plan", "execute", "verify"])
    const planStage = route.stages.find(s => s.name === "plan")!
    expect(planStage.requiresApproval).toBe(true)
  })

  it("includes scores and reason in the route", () => {
    const criteria = makeCriteria({ taskType: "feature" })
    const route = buildAdaptiveStageSequence(criteria)
    expect(route.scores.total).toBeGreaterThan(0)
    expect(typeof route.reason).toBe("string")
    expect(route.reason.length).toBeGreaterThan(0)
  })
})

// ─── shouldEscalate ───────────────────────────────────────────────────────────

describe("shouldEscalate", () => {
  it("escalates quick to standard when blastRadius > 3", () => {
    const result = shouldEscalate("quick", { blastRadius: 4 })
    expect(result).toBe("standard")
  })

  it("escalates quick to standard when testsFailing", () => {
    const result = shouldEscalate("quick", { testsFailing: true })
    expect(result).toBe("standard")
  })

  it("escalates standard to verify-heavy when isSensitive", () => {
    const result = shouldEscalate("standard", { isSensitive: true })
    expect(result).toBe("verify-heavy")
  })

  it("escalates standard to verify-heavy when blastRadius >= 5", () => {
    const result = shouldEscalate("standard", { blastRadius: 5 })
    expect(result).toBe("verify-heavy")
  })

  it("escalates standard to ui-heavy when designNeeded", () => {
    const result = shouldEscalate("standard", { designNeeded: true })
    expect(result).toBe("ui-heavy")
  })

  it("escalates quick to standard when testsFailing", () => {
    const result = shouldEscalate("quick", { testsFailing: true, blastRadius: 2 })
    // Note: quick → standard (testsFailing) is checked first, so this returns "standard"
    expect(result).toBe("standard")
  })

  it("returns null for explore when no confidence data", () => {
    const result = shouldEscalate("explore", {})
    expect(result).toBeNull()
  })

  it("returns null when no escalation is needed", () => {
    const result = shouldEscalate("quick", { blastRadius: 2 })
    expect(result).toBeNull()
  })

  it("returns null for unknown current class", () => {
    const result = shouldEscalate("docs-only", {})
    expect(result).toBeNull()
  })
})

// ─── logRoutingDecision / getHistoricalCompliance ─────────────────────────────

describe("logRoutingDecision", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-router-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("appends a routing decision to WORKFLOW_ROUTING.jsonl", () => {
    const route = buildAdaptiveStageSequence(makeCriteria({ taskType: "simple" }))
    const decision: RoutingDecision = {
      route,
      escalationHistory: [],
      skippedStages: [],
      loggedAt: new Date().toISOString(),
    }

    logRoutingDecision(tmpDir, decision)

    const logPath = join(tmpDir, ".codebase", "WORKFLOW_ROUTING.jsonl")
    const content = readFileSync(logPath, "utf-8")
    const lines = content.trim().split("\n").filter(Boolean)
    expect(lines).toHaveLength(1)

    const parsed = JSON.parse(lines[0]) as RoutingDecision
    expect(parsed.route.workflowClass).toBe("quick")
    expect(parsed.loggedAt).toBe(decision.loggedAt)
  })

  it("creates .codebase directory if missing", () => {
    const route = buildAdaptiveStageSequence(makeCriteria())
    const decision: RoutingDecision = {
      route,
      escalationHistory: [],
      skippedStages: [],
      loggedAt: new Date().toISOString(),
    }

    logRoutingDecision(tmpDir, decision)
    expect(existsSync(join(tmpDir, ".codebase"))).toBe(true)
  })
})

describe("getHistoricalCompliance", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-router-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns null when SCORECARDS.jsonl does not exist", () => {
    const result = getHistoricalCompliance(tmpDir, "feature")
    expect(result).toBeNull()
  })

  it("averages stageCompliance from existing scorecards", () => {
    const cd = join(tmpDir, ".codebase")
    mkdirSync(cd, { recursive: true })
    const scorecards = [
      { dimensions: { stageCompliance: 0.8 } },
      { dimensions: { stageCompliance: 1.0 } },
      { dimensions: { stageCompliance: 0.6 } },
    ]
    writeFileSync(
      join(cd, "SCORECARDS.jsonl"),
      scorecards.map(s => JSON.stringify(s)).join("\n") + "\n",
      "utf-8",
    )

    const result = getHistoricalCompliance(tmpDir, "feature")
    expect(result).toBeCloseTo(0.8, 5)
  })

  it("filters by taskType when present in scorecards", () => {
    const cd = join(tmpDir, ".codebase")
    mkdirSync(cd, { recursive: true })
    const scorecards = [
      { taskType: "feature", dimensions: { stageCompliance: 1.0 } },
      { taskType: "bugfix", dimensions: { stageCompliance: 0.5 } },
      { taskType: "feature", dimensions: { stageCompliance: 0.5 } },
    ]
    writeFileSync(
      join(cd, "SCORECARDS.jsonl"),
      scorecards.map(s => JSON.stringify(s)).join("\n") + "\n",
      "utf-8",
    )

    const result = getHistoricalCompliance(tmpDir, "feature")
    expect(result).toBeCloseTo(0.75, 5)
  })

  it("returns null when scorecards have no stageCompliance data", () => {
    const cd = join(tmpDir, ".codebase")
    mkdirSync(cd, { recursive: true })
    writeFileSync(
      join(cd, "SCORECARDS.jsonl"),
      JSON.stringify({ other: "data" }) + "\n",
      "utf-8",
    )

    const result = getHistoricalCompliance(tmpDir, "feature")
    expect(result).toBeNull()
  })

  it("skips malformed JSON lines gracefully", () => {
    const cd = join(tmpDir, ".codebase")
    mkdirSync(cd, { recursive: true })
    writeFileSync(
      join(cd, "SCORECARDS.jsonl"),
      "not-json\n" + JSON.stringify({ dimensions: { stageCompliance: 0.9 } }) + "\n",
      "utf-8",
    )

    const result = getHistoricalCompliance(tmpDir, "feature")
    expect(result).toBeCloseTo(0.9, 5)
  })
})

// ─── computeRoutingHeuristics ──────────────────────────────────────────────

describe("computeRoutingHeuristics", () => {
  it("requires discuss for ambiguous task types", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ taskType: "ambiguous", confidence: 0.9 }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
    expect(heuristics.classificationSignals).toContain("ambiguous_task_type")
  })

  it("requires discuss when confidence is low", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ confidence: 0.45 }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
    expect(heuristics.classificationSignals).toContain("low_confidence")
  })

  it("requires discuss for sensitive tasks regardless of confidence", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ isSensitive: true, confidence: 0.95 }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
    expect(heuristics.classificationSignals).toContain("sensitive_path")
  })

  it("requires discuss for high blast radius", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ blastRadius: 6, confidence: 0.95 }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
    expect(heuristics.classificationSignals).toContain("high_blast_radius")
  })

  it("requires discuss for expensive complexity", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ complexity: "expensive", confidence: 0.95 }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
    expect(heuristics.classificationSignals).toContain("expensive_complexity")
  })

  it("requires discuss for ui-feature tasks", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ taskType: "ui-feature", confidence: 0.95 }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
  })

  it("requires discuss for bugfix tasks", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ taskType: "bugfix", confidence: 0.95 }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
  })

  it("skips discuss for strong simple evidence", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({
        taskType: "simple",
        confidence: 0.95,
        blastRadius: 1,
        complexity: "cheap",
        codebaseFreshness: "fresh",
      }),
    })
    expect(heuristics.requiresDiscuss).toBe(false)
    expect(heuristics.skipDiscussReason).toMatch(/strong_simple/)
    expect(heuristics.classificationSignals).toContain("simple_task")
    expect(heuristics.classificationSignals).toContain("high_confidence")
  })

  it("skips discuss for docs tasks with high confidence", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({
        taskType: "docs",
        confidence: 0.90,
        blastRadius: 1,
        complexity: "cheap",
        codebaseFreshness: "fresh",
      }),
    })
    expect(heuristics.requiresDiscuss).toBe(false)
    expect(heuristics.skipDiscussReason).toMatch(/docs_quick/)
  })

  it("does NOT skip discuss when simple has low confidence", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({
        taskType: "simple",
        confidence: 0.70,
        blastRadius: 1,
        complexity: "cheap",
        codebaseFreshness: "fresh",
      }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
  })

  it("does NOT skip discuss when simple is on a sensitive path", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({
        taskType: "simple",
        confidence: 0.95,
        blastRadius: 1,
        complexity: "cheap",
        codebaseFreshness: "fresh",
        isSensitive: true,
      }),
    })
    expect(heuristics.requiresDiscuss).toBe(true)
    expect(heuristics.classificationSignals).toContain("sensitive_path")
  })

  it("flags needsCodeUnderstanding for code-touching task types", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ taskType: "feature" }),
    })
    expect(heuristics.needsCodeUnderstanding).toBe(true)
  })

  it("flags needsCodeUnderstanding when codebase is stale", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ taskType: "simple", codebaseFreshness: "stale" }),
    })
    expect(heuristics.needsCodeUnderstanding).toBe(true)
  })

  it("classificationSignals contains unique values only", () => {
    const heuristics = computeRoutingHeuristics({
      ...makeCriteria({ taskType: "bugfix" }),
    })
    const set = new Set(heuristics.classificationSignals)
    expect(set.size).toBe(heuristics.classificationSignals.length)
  })
})

// ─── buildAdaptiveStageSequence includes heuristics ───────────────────────

describe("buildAdaptiveStageSequence: heuristics surfaced", () => {
  it("populates heuristics on the returned route", () => {
    const route = buildAdaptiveStageSequence(makeCriteria({ taskType: "simple" }))
    expect(route.heuristics).toBeDefined()
    expect(typeof route.heuristics.requiresDiscuss).toBe("boolean")
    expect(Array.isArray(route.heuristics.classificationSignals)).toBe(true)
    expect(typeof route.heuristics.needsCodeUnderstanding).toBe("boolean")
  })

  it("non-trivial feature requires discuss via heuristics", () => {
    const route = buildAdaptiveStageSequence(makeCriteria({ taskType: "feature" }))
    expect(route.heuristics.requiresDiscuss).toBe(true)
  })

  it("strong simple task skips discuss via heuristics", () => {
    const route = buildAdaptiveStageSequence(makeCriteria({
      taskType: "simple",
      confidence: 1.0,
      blastRadius: 1,
      complexity: "cheap",
      codebaseFreshness: "fresh",
    }))
    expect(route.heuristics.requiresDiscuss).toBe(false)
    expect(route.heuristics.skipDiscussReason).toBeDefined()
  })
})
