/**
 * Model Router Extended Tests (Round 2)
 *
 * Covers:
 * - getOutputFormatHint: cheap → JSON directive, standard/expensive → empty
 * - hint is a string (can be prepended to prompt)
 */
import { describe, it, expect } from "vitest"
import { getOutputFormatHint } from "./model-router"

describe("getOutputFormatHint", () => {
  it("returns a non-empty string for cheap complexity", () => {
    const hint = getOutputFormatHint("cheap")
    expect(typeof hint).toBe("string")
    expect(hint.length).toBeGreaterThan(0)
    expect(hint.toLowerCase()).toContain("json")
  })

  it("returns empty string for standard complexity", () => {
    expect(getOutputFormatHint("standard")).toBe("")
  })

  it("returns empty string for expensive complexity", () => {
    expect(getOutputFormatHint("expensive")).toBe("")
  })

  it("hint is prepend-safe (no leading newlines or special chars)", () => {
    const hint = getOutputFormatHint("cheap")
    expect(hint.startsWith("\n")).toBe(false)
    expect(hint.trim().length).toBeGreaterThan(0)
  })
})
