/**
 * Tests for the fd-done completion validator.
 *
 * Covers:
 * - completion readiness validation (all blocking conditions)
 * - valid completion states pass
 * - completion summary artifact generation
 * - wasVerified helper
 */

import { describe, it, expect } from "vitest"
import {
  validateCompletionReadiness,
  buildCompletionSummary,
  wasVerified,
  type CompletionMetadata,
} from "../lib/completion-validator"
import type { PlanningState } from "../tools/planning-state-lib"

// Minimal valid state for a completable feature
function makeState(overrides: Partial<PlanningState> = {}): PlanningState {
  return {
    phase: 1,
    status: "in_progress",
    plan_confirmed: true,
    requires_design_first: false,
    design_stage: "pending",
    design_approved: false,
    design_override: false,
    steps_complete: [1, 2, 3],
    steps_pending: [],
    last_action: "Step 3 complete",
    next_action: "",
    blockers: [],
    tdd: undefined,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: "tester",
    lastUpdatedPhase: 1,
    summaryVersion: 3,
    freshnessStatus: "fresh",
    ...overrides,
  }
}

// ── validateCompletionReadiness ───────────────────────────────────────────────

describe("validateCompletionReadiness", () => {
  it("passes for a valid in_progress state with completed steps", () => {
    const result = validateCompletionReadiness(makeState())
    expect(result.valid).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.summary).toContain("Phase 1")
  })

  it("passes for a verified state", () => {
    const result = validateCompletionReadiness(makeState({ status: "verified" }))
    expect(result.valid).toBe(true)
  })

  it("blocks when plan is not confirmed", () => {
    const result = validateCompletionReadiness(makeState({ plan_confirmed: false }))
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes("Plan has not been confirmed"))).toBe(true)
  })

  it("blocks when status is already complete", () => {
    const result = validateCompletionReadiness(makeState({ status: "complete" }))
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes("already marked complete"))).toBe(true)
  })

  it("blocks when nothing has been done (planned + no steps)", () => {
    const result = validateCompletionReadiness(
      makeState({ status: "planned", steps_complete: [] })
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes("No steps completed"))).toBe(true)
  })

  it("allows planned status when steps_complete is non-empty", () => {
    // Unusual but valid — plan confirmed + steps done
    const result = validateCompletionReadiness(
      makeState({ status: "planned", steps_complete: [1] })
    )
    // plan_confirmed: true, steps_complete has entries → should pass
    expect(result.valid).toBe(true)
  })

  it("blocks when active blockers exist", () => {
    const result = validateCompletionReadiness(
      makeState({ blockers: ["Waiting for API approval", "DB migration pending"] })
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes("Unresolved blockers"))).toBe(true)
    expect(result.blockers.some(b => b.includes("Waiting for API approval"))).toBe(true)
  })

  it("ignores 'none' as a blocker entry", () => {
    const result = validateCompletionReadiness(makeState({ blockers: ["none"] }))
    expect(result.valid).toBe(true)
  })

  it("ignores empty string blocker entries", () => {
    const result = validateCompletionReadiness(makeState({ blockers: ["", "  "] }))
    expect(result.valid).toBe(true)
  })

  it("blocks when design-first required but stage is not complete", () => {
    const result = validateCompletionReadiness(
      makeState({
        requires_design_first: true,
        design_stage: "wireframe_layout",
        design_approved: false,
      })
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.some(b => b.includes("Design-first workflow not satisfied"))).toBe(true)
  })

  it("blocks when design-first required, stage complete but not approved", () => {
    const result = validateCompletionReadiness(
      makeState({
        requires_design_first: true,
        design_stage: "handoff_complete",
        design_approved: false,
      })
    )
    expect(result.valid).toBe(false)
  })

  it("passes when design-first required and fully satisfied", () => {
    const result = validateCompletionReadiness(
      makeState({
        requires_design_first: true,
        design_stage: "handoff_complete",
        design_approved: true,
      })
    )
    expect(result.valid).toBe(true)
  })

  it("passes when design-first required but design_override is set", () => {
    const result = validateCompletionReadiness(
      makeState({
        requires_design_first: true,
        design_stage: "pending",
        design_approved: false,
        design_override: true,
      })
    )
    expect(result.valid).toBe(true)
  })

  it("collects multiple blockers at once", () => {
    const result = validateCompletionReadiness(
      makeState({
        plan_confirmed: false,
        blockers: ["critical bug unresolved"],
        requires_design_first: true,
        design_stage: "pending",
        design_approved: false,
      })
    )
    expect(result.valid).toBe(false)
    expect(result.blockers.length).toBeGreaterThanOrEqual(3)
  })
})

// ── buildCompletionSummary ────────────────────────────────────────────────────

describe("buildCompletionSummary", () => {
  function makeMeta(overrides: Partial<CompletionMetadata> = {}): CompletionMetadata {
    return {
      phase: 1,
      completedAt: "2024-01-15T10:00:00.000Z",
      completedBy: "fd-done",
      priorStatus: "verified",
      stepsComplete: [1, 2, 3],
      wasVerified: true,
      changedFiles: ["src/api.ts", "src/auth.ts"],
      verifySkipped: false,
      mappingRefreshed: true,
      mappingFreshnessStatus: "fresh",
      ...overrides,
    }
  }

  it("includes phase number and timestamp", () => {
    const md = buildCompletionSummary(makeMeta())
    expect(md).toContain("Phase 1")
    expect(md).toContain("2024-01-15T10:00:00.000Z")
  })

  it("shows verified note when wasVerified is true", () => {
    const md = buildCompletionSummary(makeMeta({ wasVerified: true }))
    expect(md).toContain("/fd-verify ran")
  })

  it("shows warning when verify was skipped", () => {
    const md = buildCompletionSummary(makeMeta({ wasVerified: false, verifySkipped: true }))
    expect(md).toContain("skipped by user")
  })

  it("shows suggestion to run verify when not run and not skipped", () => {
    const md = buildCompletionSummary(makeMeta({ wasVerified: false, verifySkipped: false }))
    expect(md).toContain("consider running before deploying")
  })

  it("shows refreshed note when mapping was refreshed", () => {
    const md = buildCompletionSummary(makeMeta({ mappingRefreshed: true }))
    expect(md).toContain("Codebase mapping refreshed")
  })

  it("shows reused note when mapping was not refreshed", () => {
    const md = buildCompletionSummary(makeMeta({ mappingRefreshed: false, mappingFreshnessStatus: "fresh" }))
    expect(md).toContain("already fresh")
  })

  it("lists changed files", () => {
    const md = buildCompletionSummary(makeMeta({ changedFiles: ["src/foo.ts", "src/bar.ts"] }))
    expect(md).toContain("src/foo.ts")
    expect(md).toContain("src/bar.ts")
  })

  it("shows no-changes note when changedFiles is empty", () => {
    const md = buildCompletionSummary(makeMeta({ changedFiles: [] }))
    expect(md).toContain("none detected")
  })

  it("includes next-step suggestions", () => {
    const md = buildCompletionSummary(makeMeta())
    expect(md).toContain("/fd-status")
    expect(md).toContain("/fd-new-feature")
  })
})

// ── wasVerified helper ────────────────────────────────────────────────────────

describe("wasVerified", () => {
  it("returns true for verified status", () => {
    expect(wasVerified("verified")).toBe(true)
  })

  it("returns false for in_progress", () => {
    expect(wasVerified("in_progress")).toBe(false)
  })

  it("returns false for complete", () => {
    expect(wasVerified("complete")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(wasVerified("")).toBe(false)
  })
})

// ── /fd-done command registration ─────────────────────────────────────────────

describe("/fd-done command registration", () => {
  it("fd-done.md exists in the commands directory", async () => {
    const { existsSync } = await import("fs")
    const { join, dirname } = await import("path")
    const { fileURLToPath } = await import("url")
    const __dir = dirname(fileURLToPath(import.meta.url))
    const commandPath = join(__dir, "fd-done.md")
    expect(existsSync(commandPath)).toBe(true)
  })

  it("fd-done.md has a description in frontmatter", async () => {
    const { readFileSync } = await import("fs")
    const { join, dirname } = await import("path")
    const { fileURLToPath } = await import("url")
    const __dir = dirname(fileURLToPath(import.meta.url))
    const content = readFileSync(join(__dir, "fd-done.md"), "utf-8")
    expect(content).toMatch(/^---\n[\s\S]*description:/)
    expect(content).toContain("Mark the current feature as complete")
  })

  it("fd-done.md references planning_state tool", async () => {
    const { readFileSync } = await import("fs")
    const { join, dirname } = await import("path")
    const { fileURLToPath } = await import("url")
    const __dir = dirname(fileURLToPath(import.meta.url))
    const content = readFileSync(join(__dir, "fd-done.md"), "utf-8")
    expect(content).toContain("planning_state")
  })

  it("fd-done.md references codegraph for mapping refresh", async () => {
    const { readFileSync } = await import("fs")
    const { join, dirname } = await import("path")
    const { fileURLToPath } = await import("url")
    const __dir = dirname(fileURLToPath(import.meta.url))
    const content = readFileSync(join(__dir, "fd-done.md"), "utf-8")
    expect(content).toContain("codegraph")
  })

  it("fd-done.md writes a DONE.md completion artifact", async () => {
    const { readFileSync } = await import("fs")
    const { join, dirname } = await import("path")
    const { fileURLToPath } = await import("url")
    const __dir = dirname(fileURLToPath(import.meta.url))
    const content = readFileSync(join(__dir, "fd-done.md"), "utf-8")
    expect(content).toContain("DONE.md")
  })
})
