import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  getModelPricing,
  estimateCostUSD,
  estimateCostFromChars,
  buildCostReport,
  formatCostReport,
  getCostReport,
} from "@/services/cost-estimator"
import type { MetricEvent } from "@/services/token-metrics"

// ─── getModelPricing ─────────────────────────────────────────────────────────

describe("getModelPricing", () => {
  it("returns Sonnet pricing for claude-sonnet-4.6", () => {
    const p = getModelPricing("claude-sonnet-4.6")
    expect(p.input).toBe(3.0)
    expect(p.output).toBe(15.0)
  })

  it("returns Haiku pricing for claude-haiku-3-5", () => {
    const p = getModelPricing("claude-haiku-3-5")
    expect(p.input).toBe(0.8)
    expect(p.output).toBe(4.0)
  })

  it("returns Opus pricing for claude-opus-4", () => {
    const p = getModelPricing("claude-opus-4")
    expect(p.input).toBe(15.0)
    expect(p.output).toBe(75.0)
  })

  it("is case-insensitive", () => {
    const p = getModelPricing("Claude-Sonnet-4.6")
    expect(p.input).toBe(3.0)
  })

  it("returns fallback pricing for unknown model", () => {
    const p = getModelPricing("unknown-model-xyz")
    // Fallback is Sonnet rates
    expect(p.input).toBe(3.0)
    expect(p.output).toBe(15.0)
  })

  it("returns fallback pricing for empty string", () => {
    const p = getModelPricing("")
    expect(p.input).toBe(3.0)
    expect(p.output).toBe(15.0)
  })

  it("returns gpt-4o-mini pricing", () => {
    const p = getModelPricing("gpt-4o-mini")
    expect(p.input).toBe(0.15)
    expect(p.output).toBe(0.60)
  })

  it("gpt-4o-mini takes priority over gpt-4o", () => {
    const mini = getModelPricing("gpt-4o-mini")
    const full = getModelPricing("gpt-4o")
    expect(mini.input).toBeLessThan(full.input)
  })

  it("returns gemini-2.0-flash pricing", () => {
    const p = getModelPricing("gemini-2.0-flash")
    expect(p.input).toBe(0.10)
  })

  it("returns github-copilot/sonnet pricing", () => {
    const p = getModelPricing("github-copilot/sonnet-4.6")
    expect(p.input).toBe(3.0)
    expect(p.output).toBe(15.0)
  })
})

// ─── estimateCostUSD ─────────────────────────────────────────────────────────

describe("estimateCostUSD", () => {
  it("returns 0 for zero tokens", () => {
    expect(estimateCostUSD("claude-sonnet-4.6", 0, 0)).toBe(0)
  })

  it("calculates input-only cost correctly", () => {
    // 1000 input tokens at $3.00/1M = $0.003
    expect(estimateCostUSD("claude-sonnet-4.6", 1000, 0)).toBeCloseTo(0.003, 6)
  })

  it("calculates output-only cost correctly", () => {
    // 1000 output tokens at $15.00/1M = $0.015
    expect(estimateCostUSD("claude-sonnet-4.6", 0, 1000)).toBeCloseTo(0.015, 6)
  })

  it("calculates combined cost correctly", () => {
    // 5000 input + 1000 output for claude-sonnet-4.6
    // = (5000/1M)*3.0 + (1000/1M)*15.0 = $0.015 + $0.015 = $0.030
    expect(estimateCostUSD("claude-sonnet-4.6", 5000, 1000)).toBeCloseTo(0.030, 6)
  })

  it("haiku is cheaper than sonnet for same token counts", () => {
    const haiku = estimateCostUSD("claude-haiku", 1000, 1000)
    const sonnet = estimateCostUSD("claude-sonnet", 1000, 1000)
    expect(haiku).toBeLessThan(sonnet)
  })
})

// ─── estimateCostFromChars ────────────────────────────────────────────────────

describe("estimateCostFromChars", () => {
  it("returns 0 for zero chars", () => {
    expect(estimateCostFromChars("claude-sonnet-4.6", 0, 0)).toBe(0)
  })

  it("produces a positive value for non-zero chars", () => {
    const cost = estimateCostFromChars("claude-sonnet-4.6", 4000, 400)
    expect(cost).toBeGreaterThan(0)
  })

  it("is consistent with estimateCostUSD given 4:1 char/token ratio", () => {
    // 4000 chars ≈ 1000 tokens
    const fromChars = estimateCostFromChars("claude-sonnet-4.6", 4000, 4000)
    const fromTokens = estimateCostUSD("claude-sonnet-4.6", 1000, 1000)
    expect(fromChars).toBeCloseTo(fromTokens, 4)
  })
})

// ─── buildCostReport ─────────────────────────────────────────────────────────

describe("buildCostReport", () => {
  const workflowId = "test-workflow"
  const defaultModel = "claude-sonnet-4.6"

  const makeEvent = (overrides: Partial<MetricEvent> = {}): MetricEvent => ({
    ts: new Date().toISOString(),
    workflow_id: workflowId,
    stage: "plan" as any,
    event: "model_call",
    agent: "planner",
    model: defaultModel,
    est_input_tokens: 1000,
    est_output_tokens: 200,
    input_chars: 4000,
    output_chars: 800,
    est_cost_usd: estimateCostUSD(defaultModel, 1000, 200),
    ...overrides,
  })

  it("returns an empty report for empty events", () => {
    const report = buildCostReport(workflowId, [], defaultModel)
    expect(report.totals.est_cost_usd).toBe(0)
    expect(report.totals.model_calls).toBe(0)
    expect(report.by_agent).toHaveLength(0)
    expect(report.by_stage).toHaveLength(0)
  })

  it("sums cost across multiple model_call events", () => {
    const events = [makeEvent(), makeEvent()]
    const report = buildCostReport(workflowId, events, defaultModel)
    expect(report.totals.model_calls).toBe(2)
    expect(report.totals.est_cost_usd).toBeGreaterThan(0)
  })

  it("counts cache hits separately and not as model calls", () => {
    const events = [
      makeEvent({ event: "model_call" }),
      makeEvent({ event: "cache_hit", est_cost_usd: 0 }),
    ]
    const report = buildCostReport(workflowId, events, defaultModel)
    expect(report.totals.model_calls).toBe(1)
    expect(report.totals.cache_hits).toBe(1)
  })

  it("isolates retry cost", () => {
    const retryEvent = makeEvent({ event: "retry" })
    const expectedRetryCost = estimateCostUSD(defaultModel, retryEvent.est_input_tokens!, retryEvent.est_output_tokens!)
    const events = [
      makeEvent({ event: "model_call" }),
      retryEvent,
    ]
    const report = buildCostReport(workflowId, events, defaultModel)
    expect(report.totals.retry_cost_est_usd).toBeCloseTo(expectedRetryCost, 6)
    expect(report.totals.retries).toBe(1)
  })

  it("groups by agent correctly", () => {
    const events = [
      makeEvent({ agent: "planner" }),
      makeEvent({ agent: "coder" }),
      makeEvent({ agent: "planner" }),
    ]
    const report = buildCostReport(workflowId, events, defaultModel)
    const planner = report.by_agent.find(a => a.agent === "planner")
    const coder = report.by_agent.find(a => a.agent === "coder")
    expect(planner?.model_calls).toBe(2)
    expect(coder?.model_calls).toBe(1)
  })

  it("groups by stage correctly", () => {
    const events = [
      makeEvent({ stage: "plan" as any }),
      makeEvent({ stage: "execute" as any }),
      makeEvent({ stage: "plan" as any }),
    ]
    const report = buildCostReport(workflowId, events, defaultModel)
    const plan = report.by_stage.find(s => s.stage === "plan")
    const execute = report.by_stage.find(s => s.stage === "execute")
    expect(plan?.model_calls).toBe(2)
    expect(execute?.model_calls).toBe(1)
  })

  it("computes cost fractions summing to ~1", () => {
    const events = [
      makeEvent({ agent: "planner", est_cost_usd: 0.01 }),
      makeEvent({ agent: "coder", est_cost_usd: 0.03 }),
    ]
    const report = buildCostReport(workflowId, events, defaultModel)
    const totalFrac = report.by_stage.reduce((s, a) => s + a.cost_fraction, 0)
    expect(totalFrac).toBeCloseTo(1.0, 5)
  })
})

// ─── formatCostReport ────────────────────────────────────────────────────────

describe("formatCostReport", () => {
  it("returns a non-empty string", () => {
    const report = buildCostReport("wf", [], "claude-sonnet-4.6")
    expect(formatCostReport(report).length).toBeGreaterThan(0)
  })

  it("includes the workflow id", () => {
    const report = buildCostReport("my-workflow", [], "claude-sonnet-4.6")
    expect(formatCostReport(report)).toContain("my-workflow")
  })
})

// ─── getCostReport (file-backed) ─────────────────────────────────────────────

describe("getCostReport", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "flowdeck-cost-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns an empty report when metrics file does not exist", () => {
    const report = getCostReport(tmpDir, "no-workflow")
    // Empty report — no events, no cost
    expect(report.totals.model_calls).toBe(0)
    expect(report.totals.est_cost_usd).toBe(0)
    expect(report.by_agent).toHaveLength(0)
  })
})
