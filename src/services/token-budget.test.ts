/**
 * Token Budget Tests
 *
 * Covers:
 * - getTokenBudget: returns correct limits by stage + complexity
 * - cheap complexity gets smaller budgets than standard
 * - expensive complexity gets larger budgets than standard
 * - cheap tasks get response_directive when base is empty
 * - verify stage has built-in response_directive
 * - applyContextBudget: returns unchanged when within budget
 * - applyContextBudget: truncates to budget, preferring line boundaries
 * - applyResponseDirective: appends directive when non-empty
 * - applyResponseDirective: returns prompt unchanged when directive is empty
 */
import { describe, it, expect } from "vitest"
import { getTokenBudget, applyContextBudget, applyResponseDirective } from "./token-budget"

describe("getTokenBudget", () => {
  it("cheap complexity has smaller limits than standard", () => {
    const cheap = getTokenBudget("plan", "cheap")
    const standard = getTokenBudget("plan", "standard")
    expect(cheap.context_chars_limit).toBeLessThan(standard.context_chars_limit)
    expect(cheap.prompt_chars_limit).toBeLessThan(standard.prompt_chars_limit)
  })

  it("expensive complexity has larger limits than standard", () => {
    const expensive = getTokenBudget("plan", "expensive")
    const standard = getTokenBudget("plan", "standard")
    expect(expensive.context_chars_limit).toBeGreaterThan(standard.context_chars_limit)
    expect(expensive.prompt_chars_limit).toBeGreaterThan(standard.prompt_chars_limit)
  })

  it("cheap tasks get a response_directive", () => {
    const budget = getTokenBudget("plan", "cheap")
    expect(budget.response_directive.length).toBeGreaterThan(0)
  })

  it("verify stage has built-in response_directive for standard", () => {
    const budget = getTokenBudget("verify", "standard")
    expect(budget.response_directive).toContain("concise")
  })

  it("expensive tasks have no forced directive on normal stages", () => {
    const budget = getTokenBudget("plan", "expensive")
    expect(budget.response_directive).toBe("")
  })

  it("execute has larger context limit than discuss", () => {
    const execute = getTokenBudget("execute", "standard")
    const discuss = getTokenBudget("discuss", "standard")
    expect(execute.context_chars_limit).toBeGreaterThan(discuss.context_chars_limit)
  })

  it("returns positive values for all stages", () => {
    const stages = [
      "discuss", "plan", "execute", "verify", "design",
      "fix-bug", "write-docs", "council", "delegate",
      "pipeline", "exploration", "unknown",
    ] as const
    for (const stage of stages) {
      const budget = getTokenBudget(stage, "standard")
      expect(budget.context_chars_limit).toBeGreaterThan(0)
      expect(budget.prompt_chars_limit).toBeGreaterThan(0)
    }
  })
})

describe("applyContextBudget", () => {
  it("returns context unchanged when within budget", () => {
    const budget = getTokenBudget("plan", "expensive")
    const short = "short context"
    expect(applyContextBudget(short, budget)).toBe(short)
  })

  it("truncates context to budget limit", () => {
    const budget = { context_chars_limit: 20, prompt_chars_limit: 50, response_directive: "" }
    const long = "x".repeat(100)
    const result = applyContextBudget(long, budget)
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it("prefers trimming to a line boundary", () => {
    const budget = { context_chars_limit: 30, prompt_chars_limit: 50, response_directive: "" }
    const context = "first line\nsecond line here\nthird line content"
    const result = applyContextBudget(context, budget)
    // Should not start mid-word if a newline boundary is available
    expect(result.startsWith("\n")).toBe(false)
  })

  it("preserves most recent content (tail)", () => {
    const budget = { context_chars_limit: 10, prompt_chars_limit: 50, response_directive: "" }
    const context = "old content" + "recent content here"
    const result = applyContextBudget(context, budget)
    // The tail should contain some of the later content
    expect(context.endsWith(result.slice(-5))).toBe(true)
  })
})

describe("applyResponseDirective", () => {
  it("appends directive when non-empty", () => {
    const budget = { context_chars_limit: 1000, prompt_chars_limit: 2000, response_directive: "Be brief." }
    const result = applyResponseDirective("My prompt", budget)
    expect(result).toContain("My prompt")
    expect(result).toContain("Be brief.")
  })

  it("returns prompt unchanged when directive is empty", () => {
    const budget = { context_chars_limit: 1000, prompt_chars_limit: 2000, response_directive: "" }
    const prompt = "My prompt"
    expect(applyResponseDirective(prompt, budget)).toBe(prompt)
  })
})
