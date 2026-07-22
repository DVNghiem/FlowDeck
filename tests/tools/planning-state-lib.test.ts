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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  resolveActivePlanPath,
  resolveActiveTopic,
  slugifyTopic,
  topicPlanPath,
  topicDir,
  planningDir,
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
