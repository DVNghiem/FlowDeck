import { describe, it, expect } from "vitest"
import { buildTokenBudget, estimateTokensFromBytes } from "../../src/services/token-budget"

describe("token-budget", () => {
  it("should build deterministic budget", () => {
    const budget = buildTokenBudget(0)
    expect(budget.total).toBe(120_000)
    expect(budget.remaining).toBe(120_000)
    expect(budget.overhead + budget.context + budget.conversation + budget.working).toBeGreaterThan(0)
  })

  it("should account for used tokens", () => {
    const budget = buildTokenBudget(10_000)
    expect(budget.used).toBe(10_000)
    expect(budget.remaining).toBe(110_000)
  })

  it("should use provided context estimate", () => {
    const budget = buildTokenBudget(0, 5_000)
    expect(budget.context).toBe(5_000)
  })

  it("should include lessons and rules bytes in context", () => {
    const budget = buildTokenBudget(0, 5_000, undefined, 40, 80)
    expect(budget.context).toBe(5_000 + estimateTokensFromBytes(40) + estimateTokensFromBytes(80))
  })

  it("should estimate tokens from bytes", () => {
    expect(estimateTokensFromBytes(4)).toBe(1)
    expect(estimateTokensFromBytes(8)).toBe(2)
  })
})
