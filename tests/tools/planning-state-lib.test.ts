/**
 * Tests for the canonical plan-path resolution helper.
 *
 * Covers:
 *  - state.plan_file takes priority when it exists
 *  - falls back to <project-root>/.fd-plan/<topic>/plan.md
 *  - falls back to the most recent topic when state.topic is absent
 *  - returns null when no candidate exists
 *  - ignores plan_file when the explicit file is missing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "fs"
import { readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  resolveActivePlanPath,
  resolveActiveTopic,
  slugifyTopic,
  topicPlanPath,
  topicDir,
  planningDir,
  ensurePlanningDir,
  migrateLegacyPlanningState,
  readPlanningState,
  statePath,
  projectRoot,
} from "@/tools/planning-state-lib"

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

  it("uses the project-local topic path for the active topic", () => {
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

  it("stores state in the project root and isolates worktrees and same-basename projects", () => {
    const a = join(dir, "checkout")
    const b = join(dir, "worktree")
    const sameName = join(dir, "other", "worktree")
    mkdirSync(a, { recursive: true })
    mkdirSync(b, { recursive: true })
    mkdirSync(sameName, { recursive: true })

    expect(planningDir(a)).toBe(join(a, ".fd-plan"))
    expect(planningDir(b)).not.toBe(planningDir(a))
    expect(planningDir(sameName)).not.toBe(planningDir(b))
  })

  it("canonicalizes symlinked project paths and handles spaces", () => {
    const project = join(dir, "project with spaces")
    const alias = join(dir, "project-alias")
    mkdirSync(project, { recursive: true })
    symlinkSync(project, alias, "dir")
    expect(projectRoot(alias)).toBe(realpathSync.native(project))
    expect(planningDir(alias)).toBe(join(realpathSync.native(project), ".fd-plan"))
  })

  it("rejects a symlinked local planning directory", () => {
    const project = join(dir, "project")
    const otherRoot = join(dir, "other", ".fd-plan")
    mkdirSync(project, { recursive: true })
    mkdirSync(otherRoot, { recursive: true })
    symlinkSync(otherRoot, join(project, ".fd-plan"), "dir")
    expect(() => planningDir(project)).toThrow(/Refusing symlinked planning directory/)
    expect(() => ensurePlanningDir(project)).toThrow(/Refusing symlinked planning directory/)
  })

  it("adds the root-anchored ignore rule once and preserves existing rules", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\ncustom-rule\n", "utf-8")
    ensurePlanningDir(dir)
    ensurePlanningDir(dir)
    const rules = readFileSync(join(dir, ".gitignore"), "utf-8")
    expect(rules).toBe("node_modules/\ncustom-rule\n/.fd-plan/\n")
  })

  it("copies attributable legacy files without overwriting local files or deleting source", () => {
    const legacyRoot = join(dir, "legacy")
    const legacy = join(legacyRoot, "worktree")
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, ".project-root"), join(dir, "worktree"), "utf-8")
    writeFileSync(join(legacy, "STATE.md"), "legacy state", "utf-8")
    writeFileSync(join(legacy, "task.md"), "legacy task", "utf-8")
    const project = join(dir, "worktree")
    mkdirSync(project, { recursive: true })
    mkdirSync(join(project, ".fd-plan"), { recursive: true })
    writeFileSync(join(project, ".fd-plan", "STATE.md"), "local state", "utf-8")

    migrateLegacyPlanningState(project, join(project, ".fd-plan"), legacyRoot)
    expect(readFileSync(join(project, ".fd-plan", "STATE.md"), "utf-8")).toBe("local state")
    expect(readFileSync(join(project, ".fd-plan", "task.md"), "utf-8")).toBe("legacy task")
    expect(readFileSync(join(legacy, "STATE.md"), "utf-8")).toBe("legacy state")
  })

  it("leaves slug-only legacy data untouched when project ownership is ambiguous", () => {
    const legacyRoot = join(dir, "legacy")
    const legacy = join(legacyRoot, "project")
    const project = join(dir, "project")
    mkdirSync(legacy, { recursive: true })
    mkdirSync(project, { recursive: true })
    writeFileSync(join(legacy, "STATE.md"), "unattributed", "utf-8")

    migrateLegacyPlanningState(project, join(project, ".fd-plan"), legacyRoot)
    expect(() => readFileSync(join(project, ".fd-plan", "STATE.md"), "utf-8")).toThrow()
    expect(readFileSync(join(legacy, "STATE.md"), "utf-8")).toBe("unattributed")
  })

  it("copies unmarked legacy data only after explicit confirmation and records completion", () => {
    const legacyRoot = join(dir, "legacy")
    const legacy = join(legacyRoot, "project")
    const project = join(dir, "project")
    mkdirSync(legacy, { recursive: true })
    mkdirSync(project, { recursive: true })
    writeFileSync(join(legacy, "STATE.md"), "legacy state", "utf-8")

    expect(migrateLegacyPlanningState(project, join(project, ".fd-plan"), legacyRoot, true)).toBe(1)
    expect(readFileSync(join(project, ".fd-plan", "STATE.md"), "utf-8")).toBe("legacy state")
    expect(readFileSync(join(legacy, "STATE.md"), "utf-8")).toBe("legacy state")
    rmSync(join(project, ".fd-plan", "STATE.md"))
    expect(migrateLegacyPlanningState(project, join(project, ".fd-plan"), legacyRoot, true)).toBe(0)
    expect(() => readFileSync(join(project, ".fd-plan", "STATE.md"), "utf-8")).toThrow()
  })

  it("skips file-directory collisions and continues copying other legacy entries", () => {
    const legacyRoot = join(dir, "legacy")
    const legacy = join(legacyRoot, "project")
    const project = join(dir, "project")
    mkdirSync(join(legacy, "conflict"), { recursive: true })
    mkdirSync(project, { recursive: true })
    writeFileSync(join(legacy, ".project-root"), project, "utf-8")
    writeFileSync(join(legacy, "conflict", "nested.txt"), "legacy", "utf-8")
    mkdirSync(join(project, ".fd-plan"), { recursive: true })
    writeFileSync(join(project, ".fd-plan", "conflict"), "local file", "utf-8")
    writeFileSync(join(legacy, "safe.txt"), "safe", "utf-8")

    expect(() => migrateLegacyPlanningState(project, join(project, ".fd-plan"), legacyRoot)).not.toThrow()
    expect(readFileSync(join(project, ".fd-plan", "conflict"), "utf-8")).toBe("local file")
    expect(readFileSync(join(project, ".fd-plan", "safe.txt"), "utf-8")).toBe("safe")
    expect(readFileSync(join(legacy, "conflict", "nested.txt"), "utf-8")).toBe("legacy")
    rmSync(join(project, ".fd-plan", "conflict"))
    expect(migrateLegacyPlanningState(project, join(project, ".fd-plan"), legacyRoot)).toBe(1)
    expect(readFileSync(join(project, ".fd-plan", "conflict", "nested.txt"), "utf-8")).toBe("legacy")
  })

  it("accepts only supported workflow tiers and migrates legacy verification labels", () => {
    writeFileSync(statePath(dir), "workflowClass: STANDARD\n", "utf-8")
    expect(readPlanningState(dir).workflowClass).toBe("STANDARD")
    writeFileSync(statePath(dir), "workflowClass: EXPERIMENTAL\n", "utf-8")
    expect(readPlanningState(dir).workflowClass).toBeUndefined()

    writeFileSync(statePath(dir), "status: verified\n", "utf-8")
    expect(readPlanningState(dir).status).toBe("in_progress")
    expect(readPlanningState(dir).verificationStatus).toBe("verified")
    writeFileSync(statePath(dir), "status: not_verified\n", "utf-8")
    expect(readPlanningState(dir).status).toBe("blocked")
    expect(readPlanningState(dir).verificationStatus).toBe("not_verified")
  })
})
