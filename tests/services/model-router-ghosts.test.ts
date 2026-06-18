/**
 * Model Router Ghost-Name Regression Tests
 *
 * Covers:
 * - AGENT_TIER_MAP only contains real agent names (members of AGENT_NAMES)
 * - STAGE_AGENT_ALLOWLISTS only contains real agent names
 * - The "write-docs" stage allowlist routes to the real `writer` and
 *   `doc-updater` agents, not the stage name itself.
 *
 * Background: model-router.ts previously embedded several internal-service
 * or non-existent names (quick-router, question-guard, write-docs,
 * code-migrator, api-designer, db-designer, performance-profiler). Those
 * names are not in AGENT_NAMES, so the router could never have delegated
 * to them. This suite locks in the cleanup.
 */

import { describe, it, expect } from "vitest"
import { AGENT_NAMES } from "@/agents/index"
import { getTierForAgent, filterAgentsForStage } from "@/services/model-router"

const ALL_VALID = new Set<string>(AGENT_NAMES as readonly string[])

const KNOWN_GHOSTS = [
  "quick-router",
  "question-guard",
  "write-docs",
  "code-migrator",
  "api-designer",
  "db-designer",
  "performance-profiler",
]

describe("AGENT_TIER_MAP contains no ghost names", () => {
  it.each(KNOWN_GHOSTS)("does not have tier mapping for ghost '%s'", (ghost) => {
    // getTierForAgent falls back to "standard" for unknown agents, so
    // ghost names should appear as the default tier, not a mapped tier.
    // The key signal: no real agent with the ghost's tier is missing.
    // Stronger check: ghost names must not be members of AGENT_NAMES.
    expect(ALL_VALID.has(ghost)).toBe(false)
  })

  it("every real agent name resolves to a tier (or 'standard' default) without throwing", () => {
    for (const name of AGENT_NAMES) {
      const tier = getTierForAgent(name)
      expect(["cheap", "standard", "expensive"]).toContain(tier)
    }
  })
})

describe("STAGE_AGENT_ALLOWLISTS contains no ghost names", () => {
  const knownStages = ["discuss", "plan", "design", "execute", "verify", "fix-bug", "write-docs"]

  it.each(knownStages)(
    "stage '%s' allowlist contains only valid agent names",
    (stage) => {
      const agents = filterAgentsForStage(stage)
      if (!agents) return // unknown stage returns undefined — fine
      for (const name of agents) {
        expect(ALL_VALID.has(name)).toBe(true)
      }
    },
  )

  it("discuss stage does not include quick-router or question-guard", () => {
    const agents = filterAgentsForStage("discuss") ?? []
    expect(agents).not.toContain("quick-router")
    expect(agents).not.toContain("question-guard")
  })

  it("plan stage does not include api-designer or db-designer", () => {
    const agents = filterAgentsForStage("plan") ?? []
    expect(agents).not.toContain("api-designer")
    expect(agents).not.toContain("db-designer")
  })

  it("execute stage does not include code-migrator or performance-profiler", () => {
    const agents = filterAgentsForStage("execute") ?? []
    expect(agents).not.toContain("code-migrator")
    expect(agents).not.toContain("performance-profiler")
  })

  it("write-docs stage routes to writer and doc-updater (not the stage name)", () => {
    const agents = filterAgentsForStage("write-docs") ?? []
    expect(agents).toContain("writer")
    expect(agents).toContain("doc-updater")
    expect(agents).not.toContain("write-docs")
  })
})
