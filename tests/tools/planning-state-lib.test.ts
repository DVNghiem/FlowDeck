/**
 * Tests for the canonical plan-path resolution helper.
 *
 * Covers:
 *  - state.plan_file takes priority when it exists
 *  - falls back to .planning/phases/phase-<n>/PLAN.md
 *  - falls back to legacy .planning/PLAN.md
 *  - returns null when no candidate exists
 *  - ignores plan_file when the explicit file is missing
 *  - prefers phase 1 by default when phase is invalid
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { resolveActivePlanPath, phasePlanPath, legacyPlanPath } from "@/tools/planning-state-lib"

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "fd-resolve-plan-"))
  mkdirSync(join(dir, ".planning"), { recursive: true })
  return dir
}

function writePhasePlan(dir: string, phase: number, content: string): string {
  const phasePath = phasePlanPath(dir, phase)
  mkdirSync(join(dir, ".planning", "phases", `phase-${phase}`), { recursive: true })
  writeFileSync(phasePath, content, "utf-8")
  return phasePath
}

describe("resolveActivePlanPath", () => {
  let dir: string
  beforeEach(() => {
    dir = makeProject()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("prefers an explicit state.plan_file when it exists", () => {
    const explicit = join(dir, "custom", "MY_PLAN.md")
    mkdirSync(join(dir, "custom"), { recursive: true })
    writeFileSync(explicit, "# custom plan", "utf-8")
    const legacy = legacyPlanPath(dir)
    writeFileSync(legacy, "# legacy", "utf-8")

    const result = resolveActivePlanPath(dir, { phase: 1, plan_file: explicit })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(explicit)
    expect(result!.source).toBe("explicit_plan_file")
    expect(result!.isExplicit).toBe(true)
  })

  it("falls through to phase plan when explicit file is missing", () => {
    const phasePath = writePhasePlan(dir, 2, "# phase 2")

    const result = resolveActivePlanPath(dir, {
      phase: 2,
      plan_file: join(dir, "does", "not", "exist.md"),
    })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(phasePath)
    expect(result!.source).toBe("phase_plan")
    expect(result!.isExplicit).toBe(false)
  })

  it("uses .planning/phases/phase-<n>/PLAN.md for the active phase", () => {
    const phasePath = writePhasePlan(dir, 3, "# phase 3 plan")

    const result = resolveActivePlanPath(dir, { phase: 3 })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(phasePath)
    expect(result!.source).toBe("phase_plan")
  })

  it("falls back to legacy .planning/PLAN.md when no phase plan exists", () => {
    const legacy = legacyPlanPath(dir)
    writeFileSync(legacy, "# legacy root plan", "utf-8")

    const result = resolveActivePlanPath(dir, { phase: 4 })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(legacy)
    expect(result!.source).toBe("legacy_root_plan")
  })

  it("returns null when no plan can be located", () => {
    const result = resolveActivePlanPath(dir, { phase: 1 })
    expect(result).toBeNull()
  })

  it("defaults to phase 1 when phase is invalid", () => {
    const phasePath = writePhasePlan(dir, 1, "# phase 1")

    const result = resolveActivePlanPath(dir, { phase: 0 })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(phasePath)
  })

  it("skips explicit when plan_file is whitespace only", () => {
    const legacy = legacyPlanPath(dir)
    writeFileSync(legacy, "# legacy", "utf-8")

    const result = resolveActivePlanPath(dir, { phase: 1, plan_file: "   " })
    expect(result).not.toBeNull()
    expect(result!.source).toBe("legacy_root_plan")
  })

  it("always prioritizes state.plan_file over the phase plan", () => {
    writePhasePlan(dir, 2, "# phase plan")
    const explicit = join(dir, "override.md")
    writeFileSync(explicit, "# override", "utf-8")

    const result = resolveActivePlanPath(dir, { phase: 2, plan_file: explicit })
    expect(result!.source).toBe("explicit_plan_file")
    expect(result!.path).toBe(explicit)
  })
})
