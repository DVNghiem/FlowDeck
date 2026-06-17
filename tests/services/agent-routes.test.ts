import { describe, it, expect } from "vitest"
import { getAgentRoutes, AGENT_NAMES } from "@/agents/index"
import type { AgentRoute } from "@/agents/routing"

describe("getAgentRoutes", () => {
  it("returns a non-empty array of routes", () => {
    const routes = getAgentRoutes()
    expect(routes.length).toBeGreaterThan(0)
  })

  it("excludes orchestrator", () => {
    const routes = getAgentRoutes()
    expect(routes.find((r) => r.name === "orchestrator")).toBeUndefined()
  })

  it("includes every non-orchestrator built-in agent", () => {
    const routes = getAgentRoutes()
    const names = new Set(routes.map((r) => r.name))
    for (const name of AGENT_NAMES) {
      if (name === "orchestrator") continue
      expect(names.has(name)).toBe(true)
    }
  })

  it("skips agents whose description is empty", () => {
    const routes = getAgentRoutes()
    for (const r of routes) {
      expect(r.description.length).toBeGreaterThan(0)
    }
  })

  it("returns routes in deterministic, sorted order", () => {
    const a = getAgentRoutes()
    const b = getAgentRoutes()
    expect(a).toEqual(b)
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1].name.localeCompare(a[i].name)).toBeLessThanOrEqual(0)
    }
  })

  it("returns AgentRoute-shaped objects", () => {
    const routes: AgentRoute[] = getAgentRoutes()
    for (const r of routes) {
      expect(typeof r.name).toBe("string")
      expect(typeof r.description).toBe("string")
    }
  })
})
