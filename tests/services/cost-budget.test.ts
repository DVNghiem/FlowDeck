import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { checkCostBudget, getCostBudgetState, resetCostBudget } from "@/services/cost-budget"
import type { FlowDeckConfig } from "@/config/schema"

// Helper to build config with cost budget
function makeCfg(overrides: Partial<NonNullable<NonNullable<FlowDeckConfig["governance"]>["costBudget"]>> = {}): FlowDeckConfig {
  return {
    governance: {
      costBudget: { maxEstimatedCostUSD: 1.0, onExhaustion: "stop", ...overrides },
    },
  }
}

describe("checkCostBudget", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "flowdeck-budget-test-"))
    // Create .codebase dir so the budget file can be written
    mkdirSync(join(tmpDir, ".codebase"), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns ok when no budget is configured", () => {
    const result = checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 999 }, {})
    expect(result.status).toBe("ok")
  })

  it("returns ok when cost is below the limit", () => {
    const result = checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.5 }, makeCfg({ maxEstimatedCostUSD: 1.0 }))
    expect(result.status).toBe("ok")
  })

  it("returns exhausted when cost exceeds limit with onExhaustion=stop", () => {
    const result = checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 1.5 }, makeCfg({ maxEstimatedCostUSD: 1.0, onExhaustion: "stop" }))
    expect(result.status).toBe("exhausted")
    expect(result.message).toContain("exhausted")
  })

  it("returns warned when cost exceeds limit with onExhaustion=warn", () => {
    const result = checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 1.5 }, makeCfg({ maxEstimatedCostUSD: 1.0, onExhaustion: "warn" }))
    expect(result.status).toBe("warned")
  })

  it("accumulates cost across multiple calls", () => {
    checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.4 }, makeCfg({ maxEstimatedCostUSD: 1.0 }))
    checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.4 }, makeCfg({ maxEstimatedCostUSD: 1.0 }))
    const result = checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.4 }, makeCfg({ maxEstimatedCostUSD: 1.0 }))
    // 0.4 + 0.4 + 0.4 = 1.2 > 1.0
    expect(result.status).not.toBe("ok")
  })

  it("tracks input token limit", () => {
    const result = checkCostBudget(
      tmpDir, "wf", "run1",
      { inputTokensDelta: 200_000 },
      makeCfg({ maxEstimatedCostUSD: undefined, maxInputTokens: 100_000, onExhaustion: "stop" }),
    )
    expect(result.status).toBe("exhausted")
    expect(result.message).toContain("Input tokens")
  })

  it("tracks output token limit", () => {
    const result = checkCostBudget(
      tmpDir, "wf", "run1",
      { outputTokensDelta: 50_001 },
      makeCfg({ maxEstimatedCostUSD: undefined, maxOutputTokens: 50_000, onExhaustion: "stop" }),
    )
    expect(result.status).toBe("exhausted")
    expect(result.message).toContain("Output tokens")
  })

  it("isolates budget state per workflow+run combination", () => {
    checkCostBudget(tmpDir, "wf-A", "run1", { costUSDDelta: 0.9 }, makeCfg())
    const resultB = checkCostBudget(tmpDir, "wf-B", "run1", { costUSDDelta: 0.1 }, makeCfg())
    expect(resultB.status).toBe("ok")
  })

  it("state is persisted and reloaded across calls", () => {
    checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.3 }, makeCfg())
    const state = getCostBudgetState(tmpDir, "wf", "run1")
    expect(state).not.toBeNull()
    expect(state!.total_est_cost_usd).toBeCloseTo(0.3, 6)
    expect(state!.call_count).toBe(1)
  })
})

describe("resetCostBudget", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "flowdeck-budget-reset-"))
    mkdirSync(join(tmpDir, ".codebase"), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("clears accumulated state", () => {
    checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.5 }, makeCfg())
    resetCostBudget(tmpDir, "wf", "run1")
    const state = getCostBudgetState(tmpDir, "wf", "run1")
    expect(state).toBeNull()
  })

  it("allows budget check to succeed again after reset", () => {
    checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 1.5 }, makeCfg({ maxEstimatedCostUSD: 1.0, onExhaustion: "stop" }))
    resetCostBudget(tmpDir, "wf", "run1")
    const result = checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.1 }, makeCfg({ maxEstimatedCostUSD: 1.0, onExhaustion: "stop" }))
    expect(result.status).toBe("ok")
  })
})

describe("getCostBudgetState", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "flowdeck-budget-state-"))
    mkdirSync(join(tmpDir, ".codebase"), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns null for a workflow run that has never been checked", () => {
    expect(getCostBudgetState(tmpDir, "unknown-wf", "run99")).toBeNull()
  })

  it("returns accumulated state with call_count", () => {
    checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.01 }, {})
    checkCostBudget(tmpDir, "wf", "run1", { costUSDDelta: 0.02 }, {})
    const state = getCostBudgetState(tmpDir, "wf", "run1")
    expect(state!.call_count).toBe(2)
    expect(state!.total_est_cost_usd).toBeCloseTo(0.03, 6)
  })
})
