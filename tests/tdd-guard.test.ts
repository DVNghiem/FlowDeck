import { describe, it, expect, beforeEach } from "vitest"
import { checkTddGuard, clearStepWrites } from "../src/hooks/tdd-guard"

describe("checkTddGuard", () => {
  beforeEach(() => {
    clearStepWrites("step-1")
    clearStepWrites("step-2")
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

  it("should block markdown file when no test has been written yet", () => {
    const result = checkTddGuard("step-1", "docs/design.md", true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("[TDD Guard]")
  })

  it("should block config file when no test has been written yet", () => {
    const result = checkTddGuard("step-1", ".github/workflows/ci.yml", true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("[TDD Guard]")
  })

  it("should allow markdown file after a test file has been written", () => {
    checkTddGuard("step-1", "tests/app.test.ts", true)
    const result = checkTddGuard("step-1", "docs/design.md", true)
    expect(result.allowed).toBe(true)
  })

  it("should track writes per step independently", () => {
    // step-1 starts blocked (no test written)
    const blockedInStep1 = checkTddGuard("step-1", "src/foo.ts", true)
    expect(blockedInStep1.allowed).toBe(false)

    // step-2 starts with a test already recorded, so production writes are allowed
    checkTddGuard("step-2", "tests/foo.test.ts", true)
    const allowedInStep2 = checkTddGuard("step-2", "src/foo.ts", true)
    expect(allowedInStep2.allowed).toBe(true)
  })
})
