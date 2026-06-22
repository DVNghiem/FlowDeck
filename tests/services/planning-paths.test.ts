import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { resolveCanonicalPlanPath, readPlanCanonical, writePlanCanonical, isPlanCanonical } from "../../src/services/planning-paths"
import { statePath } from "../../src/tools/planning-state-lib"

describe("planning-paths", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flowdeck-"))
    mkdirSync(join(dir, ".planning"), { recursive: true })
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch { /* ignore */ }
  })

  it("should resolve canonical path when it exists", () => {
    const canonical = join(dir, ".planning", "phases", "phase-1", "PLAN.md")
    mkdirSync(join(dir, ".planning", "phases", "phase-1"), { recursive: true })
    writeFileSync(canonical, "# Plan", "utf-8")
    const res = resolveCanonicalPlanPath(dir, 1)
    expect(res.path).toBe(canonical)
    expect(res.source).toBe("canonical")
  })

  it("should fall back to legacy path and warn", () => {
    const legacy = join(dir, ".planning", "PLAN.md")
    writeFileSync(legacy, "# Legacy Plan", "utf-8")
    const res = resolveCanonicalPlanPath(dir, 1)
    expect(res.path).toBe(legacy)
    expect(res.source).toBe("legacy")
    expect(res.warning).toContain("legacy plan")
  })

  it("should write canonical plan", () => {
    const res = writePlanCanonical(dir, 2, "# Plan 2")
    expect(res.source).toBe("canonical")
    expect(res.path).toContain("phase-2")
  })

  it("should detect canonical plan exists", () => {
    const state = `current_phase:\n  phase: 1\n  status: planned\n`
    writeFileSync(statePath(dir), state, "utf-8")
    const canonical = join(dir, ".planning", "phases", "phase-1", "PLAN.md")
    mkdirSync(join(dir, ".planning", "phases", "phase-1"), { recursive: true })
    writeFileSync(canonical, "# Plan", "utf-8")
    expect(isPlanCanonical(dir)).toBe(true)
  })
})
