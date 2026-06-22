import { describe, it, expect } from "vitest"
import { getCodegraphReadiness, formatReadiness } from "../../src/services/codegraph-readiness"

describe("codegraph-readiness", () => {
  it("should return a valid readiness shape", () => {
    const readiness = getCodegraphReadiness("/home/nghiem/project/flowdeck")
    expect(["ready", "missing", "stale", "action_required"]).toContain(readiness.status)
    expect(typeof readiness.installed).toBe("boolean")
    expect(typeof readiness.indexed).toBe("boolean")
    expect(typeof readiness.fresh).toBe("boolean")
  })

  it("should format ready state", () => {
    const formatted = formatReadiness({
      installed: true,
      indexed: true,
      fresh: true,
      hasChangedSinceLastIndex: false,
      status: "ready",
      action: null,
      mcpAvailable: true,
    })
    expect(formatted).toBe("codegraph ready")
  })

  it("should format non-ready state", () => {
    const readiness = getCodegraphReadiness("/home/nghiem/project/flowdeck")
    expect(formatReadiness(readiness)).toContain("codegraph")
  })
})
