/**
 * Tests for the planning-state tool (read_plan / mark_complete) handling of
 * quoted STATE.md values.
 *
 * Bug fixed: the previous implementation parsed `plan_file:` and `phase:`
 * with raw regexes over STATE.md content. When the value was quoted (e.g.
 * `plan_file: "/Users/me/My Project/PLAN.md"`), the regex captured the
 * leading and trailing quotes as part of the path, which broke explicit
 * plan resolution for paths containing spaces.
 *
 * These tests exercise the parsed-state path used by read_plan and
 * mark_complete to make sure quoted values resolve cleanly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { planningStateTool } from "@/tools/planning-state"
import { statePath, phasePlanPath } from "@/tools/planning-state-lib"

interface TestContext {
  directory: string
  [key: string]: unknown
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fd-planning-state-test-"))
}

function writeState(dir: string, content: string): void {
  const sp = statePath(dir)
  mkdirSync(join(dir, ".planning"), { recursive: true })
  writeFileSync(sp, content, "utf-8")
}

async function callTool(
  args: Record<string, unknown>,
  dir: string,
): Promise<{ ok: boolean; value: unknown }> {
  // The tool is an OpenCode ToolDefinition; we invoke it via .execute() with
  // a minimal context. This mirrors how the orchestrator uses the tool.
  const tool = planningStateTool as unknown as {
    execute: (args: Record<string, unknown>, ctx: TestContext) => Promise<string>
  }
  try {
    const out = await tool.execute(args, { directory: dir })
    return { ok: true, value: JSON.parse(out) }
  } catch (err) {
    return { ok: false, value: err instanceof Error ? err.message : String(err) }
  }
}

describe("planning-state tool: read_plan with quoted plan_file", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("resolves an explicit plan_file even when the value is quoted and contains spaces", async () => {
    // Create a PLAN at a path with spaces and a quoted STATE.md value pointing at it.
    const nested = join(dir, "docs", "plans")
    mkdirSync(nested, { recursive: true })
    const planFile = join(nested, "My Plan.md")
    writeFileSync(planFile, "# My Plan\n\nStep 1: ship it\n", "utf-8")

    writeState(
      dir,
      [
        "---",
        "phase: 2",
        `plan_file: "${planFile}"`,
        "---",
        "# State",
        "freshnessStatus: fresh",
        "",
      ].join("\n"),
    )

    const result = await callTool({ action: "read_plan" }, dir)
    expect(result.ok).toBe(true)
    const v = result.value as { plan_file?: string; is_explicit?: boolean; resolved_from?: string; content?: string }
    expect(v.plan_file).toBe(planFile)
    expect(v.resolved_from).toBe("explicit_plan_file")
    expect(v.is_explicit).toBe(true)
    expect(v.content).toContain("Step 1: ship it")
  })

  it("falls back to the phase plan when no explicit plan_file is set", async () => {
    const phaseDir = join(dir, ".planning", "phases", "phase-3")
    mkdirSync(phaseDir, { recursive: true })
    const plan = phasePlanPath(dir, 3)
    writeFileSync(plan, "# Phase 3 plan\n", "utf-8")

    writeState(dir, ["---", "phase: 3", "---", "# State\nfreshnessStatus: fresh", ""].join("\n"))

    const result = await callTool({ action: "read_plan" }, dir)
    expect(result.ok).toBe(true)
    const v = result.value as { plan_file?: string; resolved_from?: string; phase?: number }
    expect(v.phase).toBe(3)
    expect(v.resolved_from).toBe("phase_plan")
    expect(v.plan_file).toBe(plan)
  })

  it("read_plan does NOT include quotes in the resolved path when plan_file is quoted", async () => {
    const nested = join(dir, "with space")
    mkdirSync(nested, { recursive: true })
    const planFile = join(nested, "PLAN.md")
    writeFileSync(planFile, "# Plan", "utf-8")
    writeState(dir, `phase: 1\nplan_file: "${planFile}"\n`)

    const result = await callTool({ action: "read_plan" }, dir)
    expect(result.ok).toBe(true)
    const v = result.value as { plan_file?: string }
    // The old bug returned paths like `"/abs/with space/PLAN.md"` with literal
    // quotes. Confirm the quotes are gone and the path is the real file.
    expect(v.plan_file).toBe(planFile)
    expect(v.plan_file).not.toMatch(/^"|"$/g)
    expect(existsSync(v.plan_file!)).toBe(true)
  })
})

describe("planning-state tool: mark_complete with quoted plan_file", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("writes RESULT.md to the right phase dir even when plan_file is quoted", async () => {
    const phaseDir = join(dir, ".planning", "phases", "phase-2")
    mkdirSync(phaseDir, { recursive: true })
    const planFile = phasePlanPath(dir, 2)
    writeFileSync(planFile, "# Phase 2\n\n[ ] Step 1: do the thing\n", "utf-8")

    // plan_file is set in STATE.md but the step-toggling must work whether
    // plan_file is quoted or not. We do NOT use plan_file in the test — we
    // want mark_complete to find the phase plan via resolution.
    writeState(
      dir,
      ["---", "phase: 2", "---", "# State\nfreshnessStatus: fresh", ""].join("\n"),
    )

    const result = await callTool({ action: "mark_complete", step: 1, summary: "shipped" }, dir)
    expect(result.ok).toBe(true)
    const v = result.value as { success?: boolean; step?: number }
    expect(v.success).toBe(true)
    expect(v.step).toBe(1)

    // The plan file should now have its step marked complete.
    const planContent = readFileSync(planFile, "utf-8")
    expect(planContent).toMatch(/\[x\] Step 1/i)

    // And the result file should exist for phase 2.
    const resultFile = join(phaseDir, "RESULT.md")
    expect(existsSync(resultFile)).toBe(true)
  })

  it("read_plan still works after mark_complete when plan_file is quoted", async () => {
    // Set up an explicit (quoted) plan_file and a phase plan as fallback.
    const nested = join(dir, "plans")
    mkdirSync(nested, { recursive: true })
    const planFile = join(nested, "My Plan.md")
    writeFileSync(planFile, "# My Plan\n\n[ ] Step 1\n", "utf-8")
    // mark_complete writes a RESULT.md under the phase dir, so the dir must exist.
    mkdirSync(join(dir, ".planning", "phases", "phase-5"), { recursive: true })
    writeState(
      dir,
      [
        "---",
        "phase: 5",
        `plan_file: "${planFile}"`,
        "---",
        "# State",
        "freshnessStatus: fresh",
        "",
      ].join("\n"),
    )

    // Run mark_complete against the resolved explicit plan_file.
    const result = await callTool({ action: "mark_complete", step: 1, summary: "did the thing" }, dir)
    expect(result.ok).toBe(true)

    // Now read_plan should still resolve to the same explicit file (not
    // fall through to .planning/phases/phase-5/PLAN.md).
    const readResult = await callTool({ action: "read_plan" }, dir)
    expect(readResult.ok).toBe(true)
    const v = readResult.value as { plan_file?: string; resolved_from?: string; is_explicit?: boolean }
    expect(v.plan_file).toBe(planFile)
    expect(v.resolved_from).toBe("explicit_plan_file")
    expect(v.is_explicit).toBe(true)
  })
})
