import { describe, it, expect, beforeEach } from "vitest"
import {
  recordToolFailure,
  getFailureWarning,
  clearSessionFailures,
} from "@/hooks/failure-memory-hook"

const SESSION_ID = "test-session"

describe("failure-memory-hook", () => {
  beforeEach(() => {
    clearSessionFailures(SESSION_ID)
  })

  it("returns empty warning after a single failure", () => {
    recordToolFailure(SESSION_ID, "read", "file not found", "src/index.ts")
    expect(getFailureWarning(SESSION_ID)).toBe("")
  })

  it("returns non-empty warning after repeated failures for the same tool and file", () => {
    recordToolFailure(SESSION_ID, "read", "file not found", "src/index.ts")
    recordToolFailure(SESSION_ID, "read", "still not found", "src/index.ts")
    const warning = getFailureWarning(SESSION_ID)
    expect(warning).toContain("FlowDeck Failure Memory")
    expect(warning).toContain("read on src/index.ts")
    expect(warning).toContain("2 attempts")
  })

  it("returns empty warning after clearing session failures", () => {
    recordToolFailure(SESSION_ID, "read", "file not found", "src/index.ts")
    recordToolFailure(SESSION_ID, "read", "still not found", "src/index.ts")
    clearSessionFailures(SESSION_ID)
    expect(getFailureWarning(SESSION_ID)).toBe("")
  })
})
