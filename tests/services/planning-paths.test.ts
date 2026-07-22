import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { resolveCanonicalPlanPath, readPlanCanonical, writePlanCanonical, isPlanCanonical } from "../../src/services/planning-paths"
import { statePath, planningDir, topicDir } from "../../src/tools/planning-state-lib"

describe("planning-paths", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flowdeck-"))
    mkdirSync(planningDir(dir), { recursive: true })
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
      rmSync(planningDir(dir), { recursive: true, force: true })
    } catch { /* ignore */ }
  })

  it("resolves the canonical topic plan path", () => {
    const res = resolveCanonicalPlanPath(dir, "add-oauth")
    expect(res.path).toBe(join(planningDir(dir), "add-oauth", "plan.md"))
    expect(res.source).toBe("canonical")
  })

  it("slugifies a free-form topic when resolving", () => {
    const res = resolveCanonicalPlanPath(dir, "Add OAuth Login")
    expect(res.path).toBe(join(planningDir(dir), "add-oauth-login", "plan.md"))
  })

  it("reads an existing canonical plan", () => {
    mkdirSync(topicDir(dir, "add-oauth"), { recursive: true })
    writeFileSync(join(topicDir(dir, "add-oauth"), "plan.md"), "# Plan", "utf-8")
    const { content, resolution } = readPlanCanonical(dir, "add-oauth")
    expect(content).toBe("# Plan")
    expect(resolution.source).toBe("canonical")
  })

  it("returns empty content when the plan does not exist", () => {
    const { content } = readPlanCanonical(dir, "missing-topic")
    expect(content).toBe("")
  })

  it("writes the canonical plan and creates the topic directory", () => {
    const res = writePlanCanonical(dir, "refactor-router", "# Router plan")
    expect(res.source).toBe("canonical")
    expect(res.path).toBe(join(planningDir(dir), "refactor-router", "plan.md"))
    expect(readFileSync(res.path, "utf-8")).toBe("# Router plan")
  })

  it("detects a canonical plan for the topic named in STATE.md", () => {
    writeFileSync(statePath(dir), `topic: "add-oauth"\nstatus: planned\n`, "utf-8")
    mkdirSync(topicDir(dir, "add-oauth"), { recursive: true })
    writeFileSync(join(topicDir(dir, "add-oauth"), "plan.md"), "# Plan", "utf-8")
    expect(isPlanCanonical(dir)).toBe(true)
  })

  it("reports no canonical plan when no topic has one", () => {
    writeFileSync(statePath(dir), `topic: "add-oauth"\nstatus: planned\n`, "utf-8")
    expect(isPlanCanonical(dir)).toBe(false)
  })
})
