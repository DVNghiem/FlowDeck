import { describe, it, expect } from "vitest"
import { SupervisorLoop, DEFAULT_SUPERVISOR_LOOP_CONFIG } from "../../src/services/supervisor-loop"

describe("supervisor-loop", () => {
  it("should stay in watching state while progress is made", () => {
    const loop = new SupervisorLoop(
      { sessionID: "s1", agentName: "backend-coder", availableAgents: ["debug-specialist"], directory: "/tmp" },
      { maxIterations: 5, maxBudget: 10, baseDelayMs: 1, backoffMultiplier: 1, noProgressThreshold: 2 },
    )
    const t1 = loop.observe(true)
    expect(t1.state).toBe("watching")
    expect(t1.terminal).toBe(false)
  })

  it("should emit exactly one recovery action for no_progress then stop", () => {
    const loop = new SupervisorLoop(
      { sessionID: "s1", agentName: "backend-coder", availableAgents: ["debug-specialist"], directory: "/tmp" },
      { maxIterations: 10, maxBudget: 20, baseDelayMs: 1, backoffMultiplier: 1, noProgressThreshold: 2 },
    )
    loop.observe(false)
    const t2 = loop.observe(false)
    expect(t2.action?.kind).toBe("retry")
    expect(t2.state).toBe("stopped")
    expect(t2.terminal).toBe(true)

    // Subsequent observations must not emit another recovery action.
    const t3 = loop.observe(false)
    expect(t3.action).toBeUndefined()
    expect(t3.state).toBe("stopped")
  })

  it("should stop on budget exceeded", () => {
    const loop = new SupervisorLoop(
      { sessionID: "s1", agentName: "backend-coder", availableAgents: ["debug-specialist"], directory: "/tmp" },
      { maxIterations: 100, maxBudget: 1, baseDelayMs: 1, backoffMultiplier: 1, noProgressThreshold: 100 },
    )
    const t1 = loop.observe(true)
    expect(t1.state).toBe("stopped")
    expect(t1.action?.kind).toBe("stop")
  })

  it("should emit exactly one recovery action for failure then stop", () => {
    const loop = new SupervisorLoop(
      { sessionID: "s1", agentName: "backend-coder", availableAgents: ["debug-specialist"], directory: "/tmp" },
      { maxIterations: 5, maxBudget: 10, baseDelayMs: 1, backoffMultiplier: 1, noProgressThreshold: 2 },
    )
    const t1 = loop.observe(true, true)
    expect(t1.action?.kind).toBe("retry")
    expect(t1.state).toBe("stopped")

    const t2 = loop.observe(true, true)
    expect(t2.action).toBeUndefined()
    expect(t2.state).toBe("stopped")
  })

  it("should expose default config values", () => {
    expect(DEFAULT_SUPERVISOR_LOOP_CONFIG.maxIterations).toBe(10)
    expect(DEFAULT_SUPERVISOR_LOOP_CONFIG.maxBudget).toBe(50)
  })
})
