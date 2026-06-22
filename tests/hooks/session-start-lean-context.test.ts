/**
 * Session Start Hook — Lean Context Tests
 *
 * Covers Step 4 of the 0.6.0 core refactor: replacing the deleted
 * `context-ingress` service with a lean session-start loader.
 *
 * Verifies:
 * - `.flowdeck/lessons.md` is loaded when present.
 * - `.flowdeck/lessons.md` is gracefully absent when missing.
 * - Language-specific rule paths are injected via the lazy-rule-loader cache.
 * - Cache invalidation: rule selection reflects a manifest mtime change.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, utimesSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { sessionStartHook } from "@/hooks/session-start"
import { invalidateRuleCache, getRuleCacheSize } from "@/services/lazy-rule-loader"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-session-start-lean-"))
}

function writePlanningState(dir: string): void {
  mkdirSync(join(dir, ".planning"), { recursive: true })
  writeFileSync(
    join(dir, ".planning", "STATE.md"),
    [
      "---",
      "phase: 1",
      "status: planned",
      "plan_confirmed: true",
      "steps_complete: []",
      "steps_pending: [1]",
      "last_action: init",
      "next_action: execute",
      "blockers: []",
      `lastUpdatedAt: "${new Date().toISOString()}"`,
      "lastUpdatedBy: planner",
      "lastUpdatedPhase: 1",
      "summaryVersion: 1",
      "freshnessStatus: fresh",
      "---",
      "",
      "# State",
    ].join("\n"),
    "utf-8",
  )
}

describe("session-start — lean context: .flowdeck/lessons.md loading", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    writePlanningState(dir)
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("injects lessons content when .flowdeck/lessons.md is present", async () => {
    const lessonsDir = join(dir, ".flowdeck")
    mkdirSync(lessonsDir, { recursive: true })
    const lessonsBody = [
      "## 2024-01-01 — typecheck loop",
      "**Severity:** high",
      "**Mistake:** Ignored skipLibCheck side effect.",
      "**Lesson:** Always run tsc --noEmit after changing tsconfig.",
      "",
      "## 2024-02-15 — caching pitfall",
      "**Severity:** medium",
      "**Mistake:** Recomputed selection on every call.",
      "**Lesson:** Key cache by project root + manifest mtime.",
      "",
    ].join("\n")
    writeFileSync(join(lessonsDir, "lessons.md"), lessonsBody, "utf-8")

    const result = await sessionStartHook({ directory: dir })

    expect(result).toHaveProperty("flowdeck_lessons_count")
    expect(result.flowdeck_lessons_count).toBeGreaterThanOrEqual(2)
    expect(result.flowdeck_lessons).toContain("typecheck loop")
    expect(result.flowdeck_lessons).toContain("caching pitfall")
  })

  it("returns null lessons when .flowdeck/lessons.md is absent", async () => {
    const result = await sessionStartHook({ directory: dir })

    expect(result.flowdeck_lessons_count).toBe(0)
    expect(result.flowdeck_lessons).toBeNull()
    // Empty payload is still present
    expect(result).toHaveProperty("flowdeck_lessons")
  })

  it("returns null lessons when .flowdeck/ directory itself is absent", async () => {
    const emptyDir = makeTempDir()
    writePlanningState(emptyDir)
    try {
      const result = await sessionStartHook({ directory: emptyDir })
      expect(result.flowdeck_lessons_count).toBe(0)
      expect(result.flowdeck_lessons).toBeNull()
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it("does not throw on a malformed lessons file (defensive read)", async () => {
    const lessonsDir = join(dir, ".flowdeck")
    mkdirSync(lessonsDir, { recursive: true })
    // Random binary-ish content; UTF-8 decoder will still produce a string.
    writeFileSync(join(lessonsDir, "lessons.md"), "\u0000\u0001\u0002not a real lesson", "utf-8")

    let result: Record<string, unknown> = {}
    let threw: unknown = null
    try {
      result = await sessionStartHook({ directory: dir })
    } catch (err) {
      threw = err
    }
    expect(threw).toBeNull()
    expect(result).toHaveProperty("flowdeck_lessons")
  })
})

describe("session-start — lean context: language rule selection", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    writePlanningState(dir)
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("detects TypeScript project and injects typescript rule paths", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf-8",
    )
    writeFileSync(join(dir, "tsconfig.json"), "{}", "utf-8")

    const result = await sessionStartHook({ directory: dir })

    expect(result.flowdeck_languages).toContain("typescript")
    const rulePaths = result.flowdeck_rule_paths as string[]
    expect(Array.isArray(rulePaths)).toBe(true)
    // The typescript/patterns.md rule should be in the selection
    expect(rulePaths.some((p: string) => p.includes("typescript"))).toBe(true)
  })

  it("returns an empty rule-path list for an unknown project (no manifest files)", async () => {
    // No package.json, no Cargo.toml, etc.
    const result = await sessionStartHook({ directory: dir })
    expect(result.flowdeck_languages).toEqual([])
    expect(result.flowdeck_rule_paths).toEqual([])
  })

  it("reuses the lazy-rule-loader cache between calls (same project, no mtime change)", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf-8",
    )

    const first = await sessionStartHook({ directory: dir })
    const sizeAfterFirst = getRuleCacheSize()
    const second = await sessionStartHook({ directory: dir })
    const sizeAfterSecond = getRuleCacheSize()

    // Same selection payload — cache served both calls.
    expect(second.flowdeck_rule_paths).toEqual(first.flowdeck_rule_paths)
    expect(second.flowdeck_languages).toEqual(first.flowdeck_languages)
    // The cache should not have grown unboundedly between the two calls.
    expect(sizeAfterSecond).toBe(sizeAfterFirst)
  })

  it("invalidates the cache when a manifest mtime changes (new languages detected)", async () => {
    const pkgPath = join(dir, "package.json")
    writeFileSync(pkgPath, JSON.stringify({ name: "x" }), "utf-8")

    const before = await sessionStartHook({ directory: dir })
    expect(before.flowdeck_languages).not.toContain("typescript")

    // Update package.json to add typescript, then bump mtime so the cache notices.
    writeFileSync(
      pkgPath,
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf-8",
    )
    const future = (Date.now() + 5_000) / 1000
    utimesSync(pkgPath, future, future)

    const after = await sessionStartHook({ directory: dir })
    expect(after.flowdeck_languages).toContain("typescript")
    // The newly-detected typescript must now appear in the rule selection.
    const afterPaths = after.flowdeck_rule_paths as string[]
    expect(afterPaths.some((p: string) => p.includes("typescript"))).toBe(true)
  })

  it("does not block the hook if rule selection throws (defensive catch)", async () => {
    // Mock existsSync temporarily so that resolveRulesDir() probes succeed,
    // but force getStartupRulePaths to throw by mocking the function.
    const lazyModule = await import("@/services/lazy-rule-loader")
    const original = lazyModule.getStartupRulePaths
    const spy = vi.spyOn(lazyModule, "getStartupRulePaths").mockImplementation(() => {
      throw new Error("synthetic failure")
    })

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf-8",
    )

    let threw: unknown = null
    let result: Record<string, unknown> = {}
    try {
      result = await sessionStartHook({ directory: dir })
    } catch (err) {
      threw = err
    }

    expect(threw).toBeNull()
    // The hook should still return a well-formed context object.
    expect(result).toHaveProperty("flowdeck_phase")
    expect(result).toHaveProperty("flowdeck_rule_paths")

    spy.mockRestore()
    void original
  })
})

describe("session-start — lean context: integration with .flowdeck/lessons.md + rules", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    writePlanningState(dir)
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("surfaces dispatch context when taskDescription is provided", async () => {
    const result = await sessionStartHook(
      { directory: dir },
      undefined,
      "build a landing page with hero section",
    )
    expect(result.flowdeck_workflow_class).toBe("ui-heavy")
    expect(result.flowdeck_primary_agent).toBe("design")
    expect(result.flowdeck_dispatch_reason).toBeDefined()
    expect(result.flowdeck_dispatch_signals).toBeInstanceOf(Array)
    expect(result.flowdeck_requires_discuss).toBe(true)
    expect(result.flowdeck_needs_code_understanding).toBe(true)
  })

  it("surfaces default dispatch context when taskDescription is empty", async () => {
    const result = await sessionStartHook({ directory: dir })
    expect(result.flowdeck_workflow_class).toBe("explore")
    expect(result.flowdeck_primary_agent).toBe("discusser")
    expect(result.flowdeck_requires_discuss).toBe(true)
    expect(result.flowdeck_dispatch_state).toBe("executable")
  })

  it("persists routing decision to audit log", async () => {
    await sessionStartHook(
      { directory: dir },
      undefined,
      "build a landing page with hero section",
    )

    const auditPath = join(dir, ".codebase", "AUDIT.jsonl")
    expect(existsSync(auditPath)).toBe(true)
    const lines = readFileSync(auditPath, "utf-8").trim().split("\n")
    const routingEvent = lines
      .map((line) => JSON.parse(line))
      .find((event) => event.kind === "routing.decision")
    expect(routingEvent).toBeDefined()
    expect(routingEvent.decision).toBe("ui-heavy")
    expect(routingEvent.details.state).toBe("executable")
  })

  it("returns both lessons and language rules in a single context object", async () => {
    const lessonsDir = join(dir, ".flowdeck")
    mkdirSync(lessonsDir, { recursive: true })
    writeFileSync(
      join(lessonsDir, "lessons.md"),
      "## 2024-01-01 — ts lesson\n**Severity:** high\n**Mistake:** x\n**Lesson:** y\n\n",
      "utf-8",
    )
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf-8",
    )

    const result = await sessionStartHook({ directory: dir })

    expect(result.flowdeck_lessons).toContain("ts lesson")
    expect(result.flowdeck_languages).toContain("typescript")
    const paths = result.flowdeck_rule_paths as string[]
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.some((p: string) => p.endsWith(".md"))).toBe(true)
  })

  it("token budget includes lessons and rules bytes", async () => {
    const lessonsDir = join(dir, ".flowdeck")
    mkdirSync(lessonsDir, { recursive: true })
    const lessonsBody = "## 2024-01-01 — ts lesson\n**Lesson:** y\n\n"
    writeFileSync(join(lessonsDir, "lessons.md"), lessonsBody, "utf-8")
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf-8",
    )

    const result = await sessionStartHook({ directory: dir })
    const budget = result.flowdeck_token_budget as Record<string, number>
    expect(budget.total).toBe(120_000)
    expect(budget.context).toBeGreaterThan(0)
    expect(result.flowdeck_lessons_bytes).toBe(
      Buffer.byteLength(result.flowdeck_lessons as string, "utf-8"),
    )
    expect(result.flowdeck_rules_bytes).toBeGreaterThan(0)
  })

  it("surfaces registry drift summary in context", async () => {
    const result = await sessionStartHook({ directory: dir })
    expect(result).toHaveProperty("flowdeck_registry_drift")
    // The value is either null (no drift) or a string report. In an empty temp
    // project all registered commands appear stale, so we only assert shape.
    const drift = result.flowdeck_registry_drift
    expect(drift === null || typeof drift === "string").toBe(true)
  })

  it("audits registry drift warning when drift exists", async () => {
    // Force drift by creating an unregistered command file.
    mkdirSync(join(dir, "src", "commands"), { recursive: true })
    writeFileSync(join(dir, "src", "commands", "fd-ghost-cmd.md"), "# Ghost", "utf-8")

    const result = await sessionStartHook({ directory: dir })
    expect(result.flowdeck_registry_drift).toContain("missing commands: fd-ghost-cmd")

    const auditPath = join(dir, ".codebase", "AUDIT.jsonl")
    expect(existsSync(auditPath)).toBe(true)
    const lines = readFileSync(auditPath, "utf-8").trim().split("\n")
    const driftEvent = lines
      .map((line) => JSON.parse(line))
      .find((event) => event.kind === "supervisor.decision" && event.decision === "registry_drift_warning")
    expect(driftEvent).toBeDefined()
  })

  it("runs bounded supervisor tick when FLOWDECK_SUPERVISOR_ENABLED=1", async () => {
    process.env.FLOWDECK_SUPERVISOR_ENABLED = "1"
    try {
      const result = await sessionStartHook({ directory: dir })
      expect(result.flowdeck_supervisor_tick).toBeDefined()
      expect(result.flowdeck_supervisor_tick).not.toBeNull()
      const tick = result.flowdeck_supervisor_tick as Record<string, unknown>
      expect(tick.state).toBe("stopped")
      expect(tick.action).toBe("retry")

      const auditPath = join(dir, ".codebase", "AUDIT.jsonl")
      const lines = readFileSync(auditPath, "utf-8").trim().split("\n")
      const recoveryEvent = lines
        .map((line) => JSON.parse(line))
        .find((event) => event.kind === "recovery.action")
      expect(recoveryEvent).toBeDefined()
    } finally {
      delete process.env.FLOWDECK_SUPERVISOR_ENABLED
    }
  })

  it("skips supervisor tick when not enabled and RUNS.jsonl absent", async () => {
    const result = await sessionStartHook({ directory: dir })
    expect(result.flowdeck_supervisor_tick).toBeNull()
  })
})
