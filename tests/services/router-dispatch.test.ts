import { describe, it, expect } from "vitest"
import { dispatchTask } from "@/services/router-dispatch"

describe("dispatchTask", () => {
  it("routes generic feature task to standard/planner", () => {
    const result = dispatchTask("add user authentication endpoint with JWT validation")
    expect(result.state).toBe("executable")
    expect(result.workflowClass).toBe("standard")
    expect(result.primaryAgent).toBe("planner")
  })

  it("routes empty input to explore/discusser", () => {
    const result = dispatchTask("")
    expect(result.state).toBe("executable")
    expect(result.workflowClass).toBe("explore")
    expect(result.primaryAgent).toBe("discusser")
    expect(result.requiresDiscuss).toBe(true)
  })

  it("routes simple typo fix in docs to docs-only/writer", () => {
    const result = dispatchTask("fix typo in README")
    expect(result.state).toBe("executable")
    expect(result.workflowClass).toBe("docs-only")
    expect(result.primaryAgent).toBe("writer")
  })

  it("routes bug reports to bugfix/debug-specialist", () => {
    const result = dispatchTask("the login endpoint returns 500")
    expect(result.state).toBe("executable")
    expect(result.workflowClass).toBe("bugfix")
    expect(result.primaryAgent).toBe("debug-specialist")
  })

  it("routes UI tasks to ui-heavy/design", () => {
    const result = dispatchTask("build a landing page with hero section")
    expect(result.state).toBe("executable")
    expect(result.workflowClass).toBe("ui-heavy")
    expect(result.primaryAgent).toBe("design")
  })

  it("routes ambiguous input to explore/discusser", () => {
    const result = dispatchTask("improve code")
    expect(result.state).toBe("executable")
    expect(result.workflowClass).toBe("explore")
    expect(result.primaryAgent).toBe("discusser")
  })

  it("returns classification signals", () => {
    const result = dispatchTask("refactor the entire auth service")
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.complexity).toBe("expensive")
  })

  it("blocks oversized task descriptions", () => {
    const oversized = "x".repeat(10_001)
    const result = dispatchTask(oversized)
    expect(result.state).toBe("blocked")
    expect(result.workflowClass).toBe("blocked")
    expect(result.signals).toContain("oversized_input")
  })

  it("errors on non-string input", () => {
    const result = dispatchTask(null as unknown as string)
    expect(result.state).toBe("error")
    expect(result.workflowClass).toBe("error")
    expect(result.signals).toContain("invalid_input")
  })
})
