import { describe, it, expect, beforeEach } from "vitest"
import { checkTddGuard, clearStepWrites } from "../src/hooks/guard"

describe("checkTddGuard", () => {
  beforeEach(() => {
    clearStepWrites("step-1")
  })

  it("should allow non-coder agents to write any file", () => {
    const result = checkTddGuard("step-1", "src/app.ts", false)
    expect(result.allowed).toBe(true)
  })

  it("should block first non-test file write by coder", () => {
    const result = checkTddGuard("step-1", "src/app.ts", true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("[TDD Guard]")
  })

  it("should allow first test file write by coder", () => {
    const result = checkTddGuard("step-1", "tests/app.test.ts", true)
    expect(result.allowed).toBe(true)
  })

  it("should allow production file after test file is written", () => {
    checkTddGuard("step-1", "tests/app.test.ts", true)
    const result = checkTddGuard("step-1", "src/app.ts", true)
    expect(result.allowed).toBe(true)
  })

  it("should exempt markdown files from TDD guard", () => {
    const result = checkTddGuard("step-1", "docs/design.md", true)
    expect(result.allowed).toBe(true)
  })

  it("should exempt config files from TDD guard", () => {
    const result = checkTddGuard("step-1", ".github/workflows/ci.yml", true)
    expect(result.allowed).toBe(true)
  })
})
