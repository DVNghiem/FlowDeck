import { describe, expect, it } from "vitest"
import {
  getModelPricing,
  estimateCostUSD,
  estimateCostFromChars,
} from "@/services/cost-estimator"

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

describe("estimateCostUSD", () => {
  it("returns 0 for zero tokens", () => {
    expect(estimateCostUSD("claude-sonnet-4.6", 0, 0)).toBe(0)
  })

  it("calculates input-only cost correctly", () => {
    expect(estimateCostUSD("claude-sonnet-4.6", 1000, 0)).toBeCloseTo(0.003, 6)
  })

  it("calculates output-only cost correctly", () => {
    expect(estimateCostUSD("claude-sonnet-4.6", 0, 1000)).toBeCloseTo(0.015, 6)
  })

  it("calculates combined cost correctly", () => {
    expect(estimateCostUSD("claude-sonnet-4.6", 5000, 1000)).toBeCloseTo(0.03, 6)
  })

  it("haiku is cheaper than sonnet for same token counts", () => {
    const haiku = estimateCostUSD("claude-haiku", 1000, 1000)
    const sonnet = estimateCostUSD("claude-sonnet", 1000, 1000)
    expect(haiku).toBeLessThan(sonnet)
  })
})

describe("estimateCostFromChars", () => {
  it("returns 0 for zero chars", () => {
    expect(estimateCostFromChars("claude-sonnet-4.6", 0, 0)).toBe(0)
  })

  it("produces a positive value for non-zero chars", () => {
    const cost = estimateCostFromChars("claude-sonnet-4.6", 4000, 400)
    expect(cost).toBeGreaterThan(0)
  })

  it("is consistent with estimateCostUSD given 4:1 char/token ratio", () => {
    const fromChars = estimateCostFromChars("claude-sonnet-4.6", 4000, 4000)
    const fromTokens = estimateCostUSD("claude-sonnet-4.6", 1000, 1000)
    expect(fromChars).toBeCloseTo(fromTokens, 4)
  })
})
