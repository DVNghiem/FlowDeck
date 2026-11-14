/**
 * Tests for the canonical plan-path resolution helper.
 *
 * Covers:
 *  - state.plan_file takes priority when it exists
 *  - falls back to ~/.fd-plan/<slug>/<topic>/plan.md
 *  - falls back to the most recent topic when state.topic is absent
 *  - returns null when no candidate exists
 *  - ignores plan_file when the explicit file is missing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "fs"
import { tmpdir, homedir } from "os"
import { join, basename } from "path"
import {
  resolveActivePlanPath,
  resolveActiveTopic,
  slugifyTopic,
  topicPlanPath,
  topicDir,
  planningDir,
  readPlanningState,
  statePath,
  requiredTopicArtifacts,
  validateTopicArtifacts,
  updatePlanningState,
  createDefaultState,
} from "@/tools/planning-state-lib"

describe("tiered planning state", () => {
  let dir: string
  beforeEach(() => { dir = makeProject() })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(planningDir(dir), { recursive: true, force: true })
  })

  it("requires only task.md in FAST, task.md in STANDARD, and all four in FULL", () => {
    expect(requiredTopicArtifacts("FAST")).toEqual(["task.md"])
    expect(requiredTopicArtifacts("STANDARD")).toEqual(["task.md"])
    expect(requiredTopicArtifacts("FULL")).toEqual(["task.md", "architecture.md", "affect.md", "plan.md"])
    mkdirSync(topicDir(dir, "topic"), { recursive: true })
    writeFileSync(join(topicDir(dir, "topic"), "task.md"), "# Task", "utf-8")
    expect(validateTopicArtifacts(dir, "topic", "FAST")).toEqual({ valid: true, missing: [] })
    expect(validateTopicArtifacts(dir, "topic", "FULL").missing).toEqual(["architecture.md", "affect.md", "plan.md"])
  })

  it("migrates a legacy verified status to lifecycle and verification fields", () => {
    writeFileSync(statePath(dir), "---\nstatus: verified\ntopic: legacy\n---\n", "utf-8")
    const state = readPlanningState(dir)
    expect(state.status).toBe("in_progress")
    expect(state.verification).toBe("verified")
    expect(state.schema_version).toBe(1)
  })

  it("writes lifecycle and verification independently with schema version", () => {
    writeFileSync(statePath(dir), "---\nstatus: planned\n---\n", "utf-8")
    updatePlanningState(dir, { status: "complete", verification: "not_verified", workflowClass: "FAST" })
    const state = readPlanningState(dir)
    expect(state.status).toBe("complete")
    expect(state.verification).toBe("not_verified")
    expect(state.workflowClass).toBe("FAST")
    expect(state.schema_version).toBe(2)
    expect(readFileSync(statePath(dir), "utf-8")).toContain("schema_version: 2")
  })

  it("reads a new state with numeric schema version and planned lifecycle", () => {
    writeFileSync(statePath(dir), createDefaultState(), "utf-8")
    const state = readPlanningState(dir)
    expect(state.schema_version).toBe(2)
    expect(state.status).toBe("planned")
    expect(state.verification).toBe("not_verified")
  })
})

describe("project planning root identity", () => {
  it("separates repositories with the same basename", () => {
    const first = mkdtempSync(join(tmpdir(), "fd-roots-a-"))
    const second = mkdtempSync(join(tmpdir(), "fd-roots-b-"))
    const a = join(first, "repo")
    const b = join(second, "repo")
    mkdirSync(a)
    mkdirSync(b)
    expect(planningDir(a)).not.toBe(planningDir(b))
    rmSync(first, { recursive: true, force: true })
    rmSync(second, { recursive: true, force: true })
  })

  it("uses the same root for a symlink alias", () => {
    const parent = mkdtempSync(join(tmpdir(), "fd-root-link-"))
    const repo = join(parent, "repo")
    const alias = join(parent, "alias")
    mkdirSync(repo)
    symlinkSync(repo, alias)
    expect(planningDir(alias)).toBe(planningDir(repo))
    rmSync(parent, { recursive: true, force: true })
  })

  it("reuses attributable legacy state and leaves unattributed legacy state untouched", () => {
    const repo = mkdtempSync(join(tmpdir(), "fd-root-legacy-"))
    const legacy = join(homedir(), ".fd-plan", basename(repo))
    mkdirSync(legacy, { recursive: true })
    try {
      writeFileSync(join(legacy, "STATE.md"), "status: planned\n", "utf-8")
      expect(planningDir(repo)).not.toBe(legacy)
      writeFileSync(join(legacy, "STATE.md"), `project_root: "${repo}"\nstatus: planned\n`, "utf-8")
      expect(planningDir(repo)).toBe(legacy)
      for (const file of ["task.md", "architecture.md", "affect.md", "plan.md"]) {
        mkdirSync(join(legacy, "old-task"), { recursive: true })
        writeFileSync(join(legacy, "old-task", file), `# ${file}`, "utf-8")
      }
      expect(validateTopicArtifacts(repo, "old-task", "FULL")).toEqual({ valid: true, missing: [] })
    } finally {
      rmSync(legacy, { recursive: true, force: true })
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "fd-resolve-plan-"))
  mkdirSync(planningDir(dir), { recursive: true })
  return dir
}

function writeTopicPlan(dir: string, topic: string, content: string): string {
  const planPath = topicPlanPath(dir, topic)
  mkdirSync(topicDir(dir, topic), { recursive: true })
  writeFileSync(planPath, content, "utf-8")
  return planPath
}

describe("slugifyTopic", () => {
  it("lowercases and hyphenates free-form topic names", () => {
    expect(slugifyTopic("Add OAuth Login")).toBe("add-oauth-login")
  })

  it("strips leading and trailing separators", () => {
    expect(slugifyTopic("  --Fix the Router!  ")).toBe("fix-the-router")
  })

  it("returns an empty string when nothing usable remains", () => {
    expect(slugifyTopic("!!!")).toBe("")
  })
})

describe("resolveActiveTopic", () => {
  let dir: string
  beforeEach(() => {
    dir = makeProject()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(planningDir(dir), { recursive: true, force: true })
  })

  it("prefers state.topic when the directory exists", () => {
    writeTopicPlan(dir, "add-oauth", "# plan")
    expect(resolveActiveTopic(dir, { topic: "add-oauth" })).toBe("add-oauth")
  })

  it("falls back to a topic directory holding artifacts when state.topic is absent", () => {
    writeTopicPlan(dir, "refactor-router", "# plan")
    expect(resolveActiveTopic(dir)).toBe("refactor-router")
  })

  it("ignores directories with no task.md or plan.md", () => {
    mkdirSync(topicDir(dir, "empty-topic"), { recursive: true })
    expect(resolveActiveTopic(dir)).toBeNull()
  })

  it("returns null when the planning directory has no topics", () => {
    expect(resolveActiveTopic(dir)).toBeNull()
  })
})

describe("resolveActivePlanPath", () => {
  let dir: string
  beforeEach(() => {
    dir = makeProject()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(planningDir(dir), { recursive: true, force: true })
  })

  it("prefers an explicit state.plan_file when it exists", () => {
    const explicit = join(dir, "custom", "MY_PLAN.md")
    mkdirSync(join(dir, "custom"), { recursive: true })
    writeFileSync(explicit, "# custom plan", "utf-8")
    writeTopicPlan(dir, "add-oauth", "# topic plan")

    const result = resolveActivePlanPath(dir, { topic: "add-oauth", plan_file: explicit })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(explicit)
    expect(result!.source).toBe("explicit_plan_file")
    expect(result!.isExplicit).toBe(true)
  })

  it("falls through to the topic plan when the explicit file is missing", () => {
    const planPath = writeTopicPlan(dir, "add-oauth", "# topic plan")

    const result = resolveActivePlanPath(dir, {
      topic: "add-oauth",
      plan_file: join(dir, "does", "not", "exist.md"),
    })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(planPath)
    expect(result!.source).toBe("topic_plan")
    expect(result!.isExplicit).toBe(false)
  })

  it("uses ~/.fd-plan/<slug>/<topic>/plan.md for the active topic", () => {
    const planPath = writeTopicPlan(dir, "refactor-router", "# router plan")

    const result = resolveActivePlanPath(dir, { topic: "refactor-router" })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(planPath)
    expect(result!.source).toBe("topic_plan")
  })

  it("resolves the topic from disk when state.topic is absent", () => {
    const planPath = writeTopicPlan(dir, "cache-invalidation", "# cache plan")

    const result = resolveActivePlanPath(dir, {})
    expect(result).not.toBeNull()
    expect(result!.path).toBe(planPath)
    expect(result!.source).toBe("topic_plan")
  })

  it("returns null when no plan can be located", () => {
    const result = resolveActivePlanPath(dir, { topic: "add-oauth" })
    expect(result).toBeNull()
  })

  it("skips explicit when plan_file is whitespace only", () => {
    const planPath = writeTopicPlan(dir, "add-oauth", "# topic plan")

    const result = resolveActivePlanPath(dir, { topic: "add-oauth", plan_file: "   " })
    expect(result).not.toBeNull()
    expect(result!.path).toBe(planPath)
    expect(result!.source).toBe("topic_plan")
  })

  it("always prioritizes state.plan_file over the topic plan", () => {
    writeTopicPlan(dir, "add-oauth", "# topic plan")
    const explicit = join(dir, "override.md")
    writeFileSync(explicit, "# override", "utf-8")

    const result = resolveActivePlanPath(dir, { topic: "add-oauth", plan_file: explicit })
    expect(result!.source).toBe("explicit_plan_file")
    expect(result!.path).toBe(explicit)
  })
})
