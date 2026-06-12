/**
 * Delegation Budget Service Tests
 *
 * Covers:
 * - init creates a per-run budget with safe defaults
 * - checkSpend decrements remaining and blocks when exhausted
 * - recordDelegation increments depth and enforces maxDepth
 * - getBudget returns the current snapshot
 * - end persists the final snapshot and removes the budget from memory
 * - resolveDelegationBudgetConfig falls back safely when config is absent
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  init,
  checkSpend,
  recordDelegation,
  getBudget,
  end,
  clearAllBudgets,
  activeBudgetCount,
  resolveDelegationBudgetConfig,
  incrementSameStepRetry,
  resetSameStepRetry,
} from "@/services/delegation-budget"
import type { FlowDeckConfig } from "@/config/schema"

describe("resolveDelegationBudgetConfig", () => {
  it("uses defaults when no config is provided", () => {
    const cfg = resolveDelegationBudgetConfig(undefined)
    expect(cfg.maxToolCalls).toBe(200)
    expect(cfg.maxDepth).toBe(3)
    expect(cfg.maxSameStepRetries).toBe(3)
  })

  it("uses config values when provided", () => {
    const config: FlowDeckConfig = {
      governance: {
        delegationBudget: {
          maxToolCalls: 50,
          maxDepth: 5,
          maxSameStepRetries: 7,
        },
      },
    }
    const cfg = resolveDelegationBudgetConfig(config)
    expect(cfg.maxToolCalls).toBe(50)
    expect(cfg.maxDepth).toBe(5)
    expect(cfg.maxSameStepRetries).toBe(7)
  })

  it("partially overrides defaults", () => {
    const config: FlowDeckConfig = {
      governance: {
        delegationBudget: {
          maxDepth: 2,
        },
      },
    }
    const cfg = resolveDelegationBudgetConfig(config)
    expect(cfg.maxToolCalls).toBe(200)
    expect(cfg.maxDepth).toBe(2)
    expect(cfg.maxSameStepRetries).toBe(3)
  })
})

describe("init", () => {
  beforeEach(() => {
    clearAllBudgets()
  })

  it("creates a budget and stores it in memory", () => {
    init("run-1")
    expect(activeBudgetCount()).toBe(1)
  })

  it("returns a budget with zero spent and depth", () => {
    const budget = init("run-2")
    expect(budget.spentToolCalls).toBe(0)
    expect(budget.currentDepth).toBe(0)
    expect(budget.sameStepRetries).toBe(0)
  })
})

describe("checkSpend", () => {
  beforeEach(() => {
    clearAllBudgets()
  })

  it("allows spending when budget is available", () => {
    init("run-1", { governance: { delegationBudget: { maxToolCalls: 3 } } })
    const first = checkSpend("run-1", "read")
    expect(first.ok).toBe(true)
    expect(first.remaining).toBe(2)
  })

  it("blocks spending when budget is exhausted", () => {
    init("run-1", { governance: { delegationBudget: { maxToolCalls: 1 } } })
    checkSpend("run-1", "read")
    const second = checkSpend("run-1", "read")
    expect(second.ok).toBe(false)
    expect(second.remaining).toBe(0)
  })

  it("returns false for unknown runId", () => {
    const result = checkSpend("unknown", "read")
    expect(result.ok).toBe(false)
    expect(result.remaining).toBe(0)
  })
})

describe("recordDelegation", () => {
  beforeEach(() => {
    clearAllBudgets()
  })

  it("returns true when depth is within limit", () => {
    init("parent", { governance: { delegationBudget: { maxDepth: 2 } } })
    const ok = recordDelegation("parent", "child")
    expect(ok).toBe(true)
    const child = getBudget("child")
    expect(child?.currentDepth).toBe(1)
  })

  it("returns false when depth exceeds limit", () => {
    init("parent", { governance: { delegationBudget: { maxDepth: 1 } } })
    recordDelegation("parent", "child")
    const ok = recordDelegation("child", "grandchild")
    expect(ok).toBe(false)
    const grandchild = getBudget("grandchild")
    expect(grandchild?.currentDepth).toBe(2)
  })

  it("returns false for unknown parent", () => {
    const ok = recordDelegation("unknown", "child")
    expect(ok).toBe(false)
  })
})

describe("same-step retries", () => {
  beforeEach(() => {
    clearAllBudgets()
  })

  it("increments retry and returns true within limit", () => {
    init("run-1", { governance: { delegationBudget: { maxSameStepRetries: 2 } } })
    expect(incrementSameStepRetry("run-1")).toBe(true)
    expect(incrementSameStepRetry("run-1")).toBe(true)
    expect(incrementSameStepRetry("run-1")).toBe(false)
  })

  it("resets retry counter", () => {
    init("run-1", { governance: { delegationBudget: { maxSameStepRetries: 1 } } })
    incrementSameStepRetry("run-1")
    resetSameStepRetry("run-1")
    expect(incrementSameStepRetry("run-1")).toBe(true)
  })
})

describe("getBudget", () => {
  beforeEach(() => {
    clearAllBudgets()
  })

  it("returns snapshot for an active run", () => {
    init("run-1", { governance: { delegationBudget: { maxToolCalls: 10 } } })
    checkSpend("run-1", "read")
    const snapshot = getBudget("run-1")
    expect(snapshot).not.toBeNull()
    expect(snapshot?.spentToolCalls).toBe(1)
    expect(snapshot?.remainingToolCalls).toBe(9)
  })

  it("returns null for unknown run", () => {
    expect(getBudget("unknown")).toBeNull()
  })
})

describe("end", () => {
  beforeEach(() => {
    clearAllBudgets()
  })

  it("returns final snapshot and removes budget from memory", () => {
    init("run-1")
    checkSpend("run-1", "read")
    const final = end("run-1")
    expect(final?.spentToolCalls).toBe(1)
    expect(activeBudgetCount()).toBe(0)
    expect(getBudget("run-1")).toBeNull()
  })

  it("returns null for unknown run", () => {
    expect(end("unknown")).toBeNull()
  })
})
