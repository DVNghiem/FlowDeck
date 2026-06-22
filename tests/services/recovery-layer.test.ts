import { describe, it, expect } from "vitest"
import {
  recommendRecovery,
  formatRecoveryAction,
  type RecoveryAction,
} from "../../src/services/recovery-layer"

describe("recovery-layer", () => {
  it("should retry on first failure", () => {
    const rec = recommendRecovery(0, "backend-coder", "tool failed", [
      "debug-specialist",
    ])
    expect(rec.action.kind).toBe("retry")
    expect(rec.confidence).toBe(1)
  })

  it("should retry with delay on second failure", () => {
    const rec = recommendRecovery(1, "backend-coder", "tool failed", [
      "debug-specialist",
    ])
    expect(rec.action.kind).toBe("retry")
    expect(rec.action).toMatchObject({ delayMs: 1000, maxAttempts: 1 })
  })

  it("should switch agent after two failures", () => {
    const rec = recommendRecovery(2, "backend-coder", "tool failed", [
      "frontend-coder",
      "debug-specialist",
    ])
    expect(rec.action.kind).toBe("switch_agent")
    expect(rec.action).toMatchObject({ from: "backend-coder" })
  })

  it("should stop after three failures when no fallback exists", () => {
    const rec = recommendRecovery(3, "backend-coder", "tool failed", [
      "backend-coder",
    ])
    expect(rec.action.kind).toBe("stop")
    expect(rec.action.kind === "stop").toBe(true)
  })

  it("should format recovery actions", () => {
    const retry: RecoveryAction = {
      kind: "retry",
      reason: "x",
      maxAttempts: 1,
      delayMs: 0,
    }
    expect(formatRecoveryAction(retry)).toContain("retry")

    const stop: RecoveryAction = { kind: "stop", reason: "x", terminal: true }
    expect(formatRecoveryAction(stop)).toContain("stop")
  })
})
