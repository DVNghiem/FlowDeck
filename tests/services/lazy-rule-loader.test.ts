/**
 * Lazy Rule Loader Tests
 *
 * Covers:
 * - parseFrontmatter: correctly parses always_on, stages, languages arrays, and description
 * - discoverRules: finds all .md files, caches results, skips README.md
 * - selectRulePaths: always_on rules always included
 * - selectRulePaths: language-mismatched rules skipped
 * - selectRulePaths: language-matched rules included
 * - selectRulePaths: stage filtering when stage is provided
 * - selectRulePaths: stage-restricted rules still included when stage is absent
 * - selectRulePaths: rules without frontmatter treated as always_on (fail-safe)
 * - getStartupRulePaths: returns paths only for selected rules
 * - detectProjectLanguages: detects TypeScript via tsconfig.json
 * - detectProjectLanguages: detects Python via requirements.txt
 * - detectProjectLanguages: detects Go via go.mod
 * - detectProjectLanguages: detects Rust via Cargo.toml
 * - buildSelectionDiagnostics: includes discovered/selected/skipped counts
 * - invalidateRuleCache: clears cached discovery results
 * - repeated loading suppressed (same dir returns cached metadata)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  parseFrontmatter,
  discoverRules,
  selectRulePaths,
  getStartupRulePaths,
  detectProjectLanguages,
  buildSelectionDiagnostics,
  invalidateRuleCache,
  getRuleCacheSize,
} from "@/services/lazy-rule-loader"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-lazy-rule-test-"))
}

function writeRule(
  dir: string,
  name: string,
  frontmatter: Record<string, unknown>,
  body = "# Rule Body",
): void {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.join(", ")}]`
      return `${k}: ${v}`
    })
    .join("\n")
  const content = `---\n${fm}\n---\n\n${body}`
  writeFileSync(join(dir, name), content, "utf-8")
}

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses description, always_on boolean, and arrays", () => {
    const md = `---\ndescription: my rule\nalways_on: true\nstages: [execute, verify]\nlanguages: [typescript, python]\n---\n\n# Body`
    const fm = parseFrontmatter(md)
    expect(fm.description).toBe("my rule")
    expect(fm.always_on).toBe(true)
    expect(fm.stages).toEqual(["execute", "verify"])
    expect(fm.languages).toEqual(["typescript", "python"])
  })

  it("returns empty object when no frontmatter block", () => {
    const fm = parseFrontmatter("# No frontmatter here")
    expect(Object.keys(fm)).toHaveLength(0)
  })

  it("parses false boolean correctly", () => {
    const md = `---\nalways_on: false\n---\n`
    const fm = parseFrontmatter(md)
    expect(fm.always_on).toBe(false)
  })

  it("parses empty array", () => {
    const md = `---\nstages: []\n---\n`
    const fm = parseFrontmatter(md)
    expect(fm.stages).toEqual([])
  })

  it("parses single-element array", () => {
    const md = `---\nlanguages: [go]\n---\n`
    const fm = parseFrontmatter(md)
    expect(fm.languages).toEqual(["go"])
  })
})

// ─── discoverRules ────────────────────────────────────────────────────────────

describe("discoverRules", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("returns empty array for nonexistent directory", () => {
    expect(discoverRules("/nonexistent/path/xyz")).toEqual([])
  })

  it("discovers .md files and skips README.md", () => {
    writeRule(dir, "rule-a.md", { always_on: true })
    writeRule(dir, "rule-b.md", { always_on: false })
    writeFileSync(join(dir, "README.md"), "# readme", "utf-8")

    const rules = discoverRules(dir)
    expect(rules).toHaveLength(2)
    expect(rules.map(r => r.path).some(p => p.endsWith("README.md"))).toBe(false)
  })

  it("walks subdirectories recursively", () => {
    mkdirSync(join(dir, "sub"), { recursive: true })
    writeRule(dir, "top.md", { always_on: true })
    writeRule(join(dir, "sub"), "nested.md", { always_on: false })

    const rules = discoverRules(dir)
    expect(rules).toHaveLength(2)
  })

  it("caches results: second call does not re-read files", () => {
    writeRule(dir, "cached.md", { always_on: true })
    const first = discoverRules(dir)
    const second = discoverRules(dir)
    // Same array reference after cache hit
    expect(second).toBe(first)
  })

  it("invalidateRuleCache clears cache", () => {
    writeRule(dir, "cached.md", { always_on: true })
    const before = getRuleCacheSize()
    discoverRules(dir)
    expect(getRuleCacheSize()).toBe(before + 1)
    invalidateRuleCache()
    expect(getRuleCacheSize()).toBe(0)
  })

  it("treats files without frontmatter as always_on (fail-safe)", () => {
    writeFileSync(join(dir, "no-fm.md"), "# No frontmatter", "utf-8")
    const rules = discoverRules(dir)
    expect(rules[0].always_on).toBe(true)
  })
})

// ─── selectRulePaths ─────────────────────────────────────────────────────────

describe("selectRulePaths: always_on rules", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("always includes always_on rules regardless of language", () => {
    writeRule(dir, "always.md", { always_on: true, stages: [], languages: [] })
    writeRule(dir, "ts-only.md", { always_on: false, languages: ["typescript"] })

    const sel = selectRulePaths(dir, { languages: ["python"] })
    const names = sel.selected.map(r => r.path).map(p => p.split("/").pop())
    expect(names).toContain("always.md")
    expect(names).not.toContain("ts-only.md")
  })

  it("reason for always_on rule is 'always_on=true'", () => {
    writeRule(dir, "core.md", { always_on: true })
    const sel = selectRulePaths(dir, {})
    const key = sel.selected[0].path
    expect(sel.reasons[key]).toBe("always_on=true")
  })
})

describe("selectRulePaths: language filtering", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("skips a language-restricted rule when language does not match", () => {
    writeRule(dir, "go-patterns.md", { always_on: false, languages: ["go"], stages: [] })

    const sel = selectRulePaths(dir, { languages: ["typescript"] })
    expect(sel.selected).toHaveLength(0)
    expect(sel.skipped).toHaveLength(1)
    expect(sel.reasons[sel.skipped[0].path]).toMatch(/language_mismatch/)
  })

  it("includes a language-restricted rule when language matches", () => {
    writeRule(dir, "ts-patterns.md", { always_on: false, languages: ["typescript"], stages: [] })

    const sel = selectRulePaths(dir, { languages: ["typescript"] })
    expect(sel.selected).toHaveLength(1)
    expect(sel.reasons[sel.selected[0].path]).toMatch(/language_match/)
  })

  it("includes a language rule when one of multiple detected languages matches", () => {
    writeRule(dir, "java.md", { always_on: false, languages: ["java"] })

    const sel = selectRulePaths(dir, { languages: ["typescript", "java"] })
    expect(sel.selected).toHaveLength(1)
  })

  it("skips all non-matching language rules, leaving zero selected", () => {
    writeRule(dir, "rust.md", { always_on: false, languages: ["rust"] })
    writeRule(dir, "python.md", { always_on: false, languages: ["python"] })

    const sel = selectRulePaths(dir, { languages: ["go"] })
    expect(sel.selected).toHaveLength(0)
    expect(sel.skipped).toHaveLength(2)
  })

  it("skips language-restricted rule when no languages detected (unknown project)", () => {
    writeRule(dir, "ts.md", { always_on: false, languages: ["typescript"] })
    const sel = selectRulePaths(dir, { languages: [] })
    expect(sel.skipped).toHaveLength(1)
    expect(sel.reasons[sel.skipped[0].path]).toMatch(/unknown/)
  })
})

describe("selectRulePaths: stage filtering", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("filters stage-restricted rule when stage is provided and does not match", () => {
    writeRule(dir, "execute-only.md", { always_on: false, stages: ["execute", "fix-bug"] })

    const sel = selectRulePaths(dir, { stage: "discuss" })
    expect(sel.skipped).toHaveLength(1)
    expect(sel.reasons[sel.skipped[0].path]).toMatch(/stage_mismatch/)
  })

  it("includes stage-restricted rule when stage matches", () => {
    writeRule(dir, "execute-only.md", { always_on: false, stages: ["execute"] })

    const sel = selectRulePaths(dir, { stage: "execute" })
    expect(sel.selected).toHaveLength(1)
    expect(sel.reasons[sel.selected[0].path]).toMatch(/stage_match/)
  })

  it("includes stage-restricted rule at startup when no stage provided", () => {
    // At startup (no stage known), stage-restricted common rules are still included
    writeRule(dir, "common-coding.md", { always_on: false, stages: ["execute", "verify"] })

    const sel = selectRulePaths(dir, {})
    // With no stage filter, stage-restricted rules are included (no filter applied)
    expect(sel.selected).toHaveLength(1)
  })
})

describe("selectRulePaths: diagnostic counts", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("total_discovered equals number of .md files excluding README", () => {
    writeRule(dir, "a.md", { always_on: true })
    writeRule(dir, "b.md", { always_on: false, languages: ["go"] })
    writeFileSync(join(dir, "README.md"), "ignore", "utf-8")

    const sel = selectRulePaths(dir, { languages: ["typescript"] })
    expect(sel.total_discovered).toBe(2)
    expect(sel.selected).toHaveLength(1) // only always_on
    expect(sel.skipped).toHaveLength(1)  // language mismatch
  })
})

// ─── getStartupRulePaths ──────────────────────────────────────────────────────

describe("getStartupRulePaths", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("returns only paths of selected rules", () => {
    writeRule(dir, "core.md", { always_on: true })
    writeRule(dir, "ts.md", { always_on: false, languages: ["typescript"] })
    writeRule(dir, "go.md", { always_on: false, languages: ["go"] })

    const paths = getStartupRulePaths(dir, ["typescript"])
    expect(paths).toHaveLength(2) // core + ts
    expect(paths.some(p => p.endsWith("go.md"))).toBe(false)
  })

  it("returns only always_on rules when no languages detected", () => {
    writeRule(dir, "core.md", { always_on: true })
    writeRule(dir, "ts.md", { always_on: false, languages: ["typescript"] })

    const paths = getStartupRulePaths(dir, [])
    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatch(/core\.md$/)
  })
})

// ─── detectProjectLanguages ───────────────────────────────────────────────────

describe("detectProjectLanguages", () => {
  let dir: string

  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it("detects TypeScript when tsconfig.json present with package.json", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }), "utf-8")
    writeFileSync(join(dir, "tsconfig.json"), "{}", "utf-8")
    expect(detectProjectLanguages(dir)).toContain("typescript")
  })

  it("detects TypeScript when typescript in devDependencies", () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf-8",
    )
    expect(detectProjectLanguages(dir)).toContain("typescript")
  })

  it("falls back to javascript when no tsconfig and no typescript dep", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "js-project" }), "utf-8")
    const langs = detectProjectLanguages(dir)
    expect(langs).toContain("javascript")
    expect(langs).not.toContain("typescript")
  })

  it("detects Go when go.mod present", () => {
    writeFileSync(join(dir, "go.mod"), "module example.com/mymod\ngo 1.21", "utf-8")
    expect(detectProjectLanguages(dir)).toContain("go")
  })

  it("detects Rust when Cargo.toml present", () => {
    writeFileSync(join(dir, "Cargo.toml"), "[package]\nname = \"hello\"", "utf-8")
    expect(detectProjectLanguages(dir)).toContain("rust")
  })

  it("detects Java when pom.xml present", () => {
    writeFileSync(join(dir, "pom.xml"), "<project/>", "utf-8")
    expect(detectProjectLanguages(dir)).toContain("java")
  })

  it("detects Python when requirements.txt present", () => {
    writeFileSync(join(dir, "requirements.txt"), "flask==3.0.0", "utf-8")
    expect(detectProjectLanguages(dir)).toContain("python")
  })

  it("detects Python when pyproject.toml present", () => {
    writeFileSync(join(dir, "pyproject.toml"), "[tool.poetry]\nname='x'", "utf-8")
    expect(detectProjectLanguages(dir)).toContain("python")
  })

  it("detects multiple languages (polyglot repo)", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5" } }), "utf-8")
    writeFileSync(join(dir, "requirements.txt"), "flask", "utf-8")
    const langs = detectProjectLanguages(dir)
    expect(langs).toContain("typescript")
    expect(langs).toContain("python")
  })

  it("returns empty array for an unknown project", () => {
    expect(detectProjectLanguages(dir)).toHaveLength(0)
  })

  it("deduplicates when multiple indicators for same language exist", () => {
    writeFileSync(join(dir, "pom.xml"), "<project/>", "utf-8")
    writeFileSync(join(dir, "build.gradle"), "apply plugin: 'java'", "utf-8")
    const langs = detectProjectLanguages(dir)
    const javaCounts = langs.filter(l => l === "java").length
    expect(javaCounts).toBe(1)
  })
})

// ─── buildSelectionDiagnostics ────────────────────────────────────────────────

describe("buildSelectionDiagnostics", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
    invalidateRuleCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    invalidateRuleCache()
  })

  it("includes discovered/selected/skipped counts", () => {
    writeRule(dir, "core.md", { always_on: true, description: "core rule" })
    writeRule(dir, "go.md", { always_on: false, languages: ["go"] })

    const sel = selectRulePaths(dir, { languages: ["typescript"] })
    const diag = buildSelectionDiagnostics(sel, { languages: ["typescript"] })

    expect(diag).toContain("discovered=2")
    expect(diag).toContain("selected=1")
    expect(diag).toContain("skipped=1")
  })

  it("includes LOAD and SKIP labels", () => {
    writeRule(dir, "core.md", { always_on: true })
    writeRule(dir, "py.md", { always_on: false, languages: ["python"] })

    const sel = selectRulePaths(dir, { languages: [] })
    const diag = buildSelectionDiagnostics(sel, { languages: [] })

    expect(diag).toContain("LOAD")
    expect(diag).toContain("SKIP")
  })

  it("mentions the context language and stage", () => {
    writeRule(dir, "core.md", { always_on: true })
    const sel = selectRulePaths(dir, { languages: ["rust"], stage: "execute" })
    const diag = buildSelectionDiagnostics(sel, { languages: ["rust"], stage: "execute" })

    expect(diag).toContain("rust")
    expect(diag).toContain("execute")
  })
})

// ─── project-root cache ───────────────────────────────────────────────────────

describe("detectProjectLanguages: caching", () => {
  let dir: string

  beforeEach(() => { dir = makeTempDir(); invalidateRuleCache() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateRuleCache() })

  it("caches language detection for the same project root", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5" } }), "utf-8")
    const first = detectProjectLanguages(dir)
    const second = detectProjectLanguages(dir)
    expect(first).toBe(second)
  })

  it("invalidates cache when a marker file mtime changes", () => {
    const pkgPath = join(dir, "package.json")
    writeFileSync(pkgPath, JSON.stringify({ name: "x" }), "utf-8")
    const first = detectProjectLanguages(dir)

    // Update package.json to add typescript
    writeFileSync(pkgPath, JSON.stringify({ devDependencies: { typescript: "^5" } }), "utf-8")
    // Manually bump mtime so the cache notices
    const now = Date.now() + 1000
    try {
      const { utimesSync } = require("fs")
      utimesSync(pkgPath, now / 1000, now / 1000)
    } catch { /* ignore */ }

    const second = detectProjectLanguages(dir)
    expect(second).not.toBe(first)
    expect(second).toContain("typescript")
  })
})

describe("selectRulePaths: caching", () => {
  let dir: string

  beforeEach(() => { dir = makeTempDir(); invalidateRuleCache() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateRuleCache() })

  it("returns the same selection object for identical context", () => {
    writeRule(dir, "core.md", { always_on: true })
    const ctx = { languages: ["typescript"], stage: "execute" as const, projectRoot: dir }
    const first = selectRulePaths(dir, ctx)
    const second = selectRulePaths(dir, ctx)
    expect(second).toBe(first)
  })

  it("produces different selection cache entries for different stages", () => {
    writeRule(dir, "exec.md", { always_on: false, stages: ["execute"] })
    const first = selectRulePaths(dir, { stage: "execute", projectRoot: dir })
    const second = selectRulePaths(dir, { stage: "discuss", projectRoot: dir })
    expect(first.selected).toHaveLength(1)
    expect(second.selected).toHaveLength(0)
  })

  it("produces different selection cache entries for different languages", () => {
    writeRule(dir, "ts.md", { always_on: false, languages: ["typescript"] })
    const first = selectRulePaths(dir, { languages: ["typescript"], projectRoot: dir })
    const second = selectRulePaths(dir, { languages: ["go"], projectRoot: dir })
    expect(first.selected).toHaveLength(1)
    expect(second.selected).toHaveLength(0)
  })
})

describe("invalidateRuleCache", () => {
  it("clears discovery, language, and selection caches", () => {
    invalidateRuleCache()
    expect(getRuleCacheSize()).toBe(0)
  })
})
