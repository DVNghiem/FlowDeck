/**
 * Lazy Rule Loader
 *
 * Replaces the eager `loadRulePaths()` (loads all rule files) with two-phase discovery:
 *
 * 1. Discovery (cheap): reads frontmatter-only metadata from all rule files without
 *    loading their full content. Results are cached per `rulesDir`.
 *
 * 2. Selection: filters rules by `always_on`, `languages`, and `stages` signals
 *    derived from the project context.
 *
 * This eliminates unrelated language patterns (e.g. Java rules for a TypeScript
 * project) and provides the infrastructure for future stage-based lazy loading.
 *
 * Rules without frontmatter are treated as always-on (fail-safe).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { join, basename } from "path"


/** Metadata parsed from a rule file's YAML frontmatter. */
export interface RuleMetadata {
  /** Absolute path to the rule file. */
  path: string
  /** One-line description extracted from frontmatter. */
  description: string
  /** If true, inject unconditionally regardless of stage/language. */
  always_on: boolean
  /**
   * Workflow stages this rule is relevant for (empty = all stages).
   * Values: discuss | plan | execute | verify | fix-bug | write-docs
   */
  stages: string[]
  /**
   * Project languages this rule applies to (empty = all languages).
   * Values: typescript | javascript | python | go | java | rust
   */
  languages: string[]
}

/** Context signals used to select rules. */
export interface SelectionContext {
  /** Detected project languages (e.g. ["typescript"]). */
  languages?: string[]
  /**
   * Current workflow stage. When provided, stage-restricted rules are
   * filtered to only those matching the stage.
   * When absent (e.g. at plugin startup), stage-restricted rules are still
   * included if they have no language restriction, or excluded if they require
   * a specific language that isn't detected.
   */
  stage?: string
  /** Project root used for cache invalidation via marker file mtime. */
  projectRoot?: string
}

/** Result of a rule selection pass. */
export interface RuleSelection {
  selected: RuleMetadata[]
  skipped: RuleMetadata[]
  /** Map from file path to human-readable selection reason. */
  reasons: Record<string, string>
  total_discovered: number
}

// In-memory discovery cache

/** Keyed by rulesDir. Invalidated by `invalidateRuleCache()`. */
const _discoveryCache = new Map<string, RuleMetadata[]>()

// Project-root cache for language detection and rule selection

const WATCH_FILES = ["package.json", "Cargo.toml", "go.mod", "pyproject.toml"]

function getProjectMtime(root?: string): number {
  if (!root) return 0
  let latest = 0
  for (const f of WATCH_FILES) {
    try {
      const s = statSync(join(root, f))
      if (s.mtimeMs > latest) latest = s.mtimeMs
    } catch {
      // skip missing marker files
    }
  }
  return latest
}

const _languageCache = new Map<string, { languages: string[]; mtime: number }>()
const _selectionCache = new Map<string, RuleSelection>()

function selectionCacheKey(
  rulesDir: string,
  context: SelectionContext,
): string {
  const parts = [
    rulesDir,
    context.projectRoot ?? "",
    context.stage ?? "",
    (context.languages ?? []).join(","),
    String(getProjectMtime(context.projectRoot)),
  ]
  return parts.join("::")
}

/**
 * Parse a minimal YAML frontmatter block from markdown content.
 * Supports string, boolean, and bracketed array values only.
 * Returns an empty object if no `---` delimited frontmatter is found.
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) return {}

  const fm: Record<string, unknown> = {}
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+)$/)
    if (!kv) continue
    const [, key, raw] = kv
    const val = raw.trim()
    if (val.startsWith("[") && val.endsWith("]")) {
      fm[key] = val
        .slice(1, -1)
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    } else if (val === "true") {
      fm[key] = true
    } else if (val === "false") {
      fm[key] = false
    } else {
      fm[key] = val
    }
  }
  return fm
}

// Metadata reading

/**
 * Read frontmatter metadata from a single rule file.
 * Only reads the first 512 characters to avoid loading large rule bodies.
 * Falls back to `always_on: true` on any read/parse error (fail-safe).
 */
function readRuleMetadata(filePath: string): RuleMetadata {
  try {
    // Read only the beginning of the file to extract frontmatter cheaply
    const fullContent = readFileSync(filePath, "utf-8")
    // Frontmatter is always at the start; slice to avoid parsing large files
    const head = fullContent.slice(0, 1024)
    const fm = parseFrontmatter(head)

    // If no frontmatter found, default to always_on: true (fail-safe for untagged rules)
    const hasFrontmatter = Object.keys(fm).length > 0
    return {
      path: filePath,
      description: typeof fm.description === "string" ? fm.description : "",
      always_on: hasFrontmatter ? fm.always_on === true : true,
      stages: Array.isArray(fm.stages) ? (fm.stages as string[]) : [],
      languages: Array.isArray(fm.languages) ? (fm.languages as string[]) : [],
    }
  } catch {
    // Fail-safe: treat unreadable files as always-on
    return { path: filePath, description: "", always_on: true, stages: [], languages: [] }
  }
}

// Discovery

/**
 * Scan a directory for `*.md` rule files and return their metadata (frontmatter only).
 * Results are cached per `rulesDir` until `invalidateRuleCache()` is called.
 */
export function discoverRules(rulesDir: string): RuleMetadata[] {
  const cached = _discoveryCache.get(rulesDir)
  if (cached) return cached

  if (!existsSync(rulesDir)) return []

  const results: RuleMetadata[] = []

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "README.md"
      ) {
        results.push(readRuleMetadata(full))
      }
    }
  }

  walk(rulesDir)
  _discoveryCache.set(rulesDir, results)
  return results
}

// ─── Selection ────────────────────────────────────────────────────────────────

/**
 * Select which rule files should be loaded for the given context.
 *
 * Selection rules (evaluated in order):
 *
 * 1. `always_on: true` → always selected.
 * 2. Language-restricted (`languages` non-empty):
 *    - Selected if any detected project language matches.
 *    - Skipped if no language match (eliminates foreign-language patterns).
 * 3. Stage-restricted (`stages` non-empty, `stage` provided in context):
 *    - Selected if the current stage matches.
 *    - Skipped if stage doesn't match.
 * 4. All other rules (no language, no stage restriction) → selected.
 */
export function selectRulePaths(
  rulesDir: string,
  context: SelectionContext = {},
): RuleSelection {
  const cacheKey = selectionCacheKey(rulesDir, context)
  const cached = _selectionCache.get(cacheKey)
  if (cached) return cached

  const all = discoverRules(rulesDir)
  const selected: RuleMetadata[] = []
  const skipped: RuleMetadata[] = []
  const reasons: Record<string, string> = {}

  const detectedLangs = context.languages ?? []

  for (const rule of all) {
    const name = basename(rule.path)

    // Always-on: include unconditionally
    if (rule.always_on) {
      selected.push(rule)
      reasons[rule.path] = "always_on=true"
      continue
    }

    // Language filtering: if the rule requires specific languages, check intersection
    if (rule.languages.length > 0) {
      const matches = rule.languages.some(l => detectedLangs.includes(l))
      if (!matches) {
        skipped.push(rule)
        reasons[rule.path] =
          `language_mismatch: rule=${rule.languages.join("|")} detected=${detectedLangs.join("|") || "unknown"}`
        continue
      }
    }

    // Stage filtering: only apply when stage is explicitly provided
    if (rule.stages.length > 0 && context.stage) {
      if (!rule.stages.includes(context.stage)) {
        skipped.push(rule)
        reasons[rule.path] =
          `stage_mismatch: rule=${rule.stages.join("|")} current=${context.stage}`
        continue
      }
    }

    selected.push(rule)
    reasons[rule.path] =
      rule.languages.length > 0
        ? `language_match: ${rule.languages.join("|")}`
        : rule.stages.length > 0
        ? `stage_match: ${rule.stages.join("|")} (no current stage filter)`
        : "default_include: no language/stage restriction"
  }

  const result: RuleSelection = { selected, skipped, reasons, total_discovered: all.length }
  _selectionCache.set(cacheKey, result)
  return result
}

/**
 * Convenience wrapper: returns the file paths to inject into `cfg.instructions`
 * at plugin startup. Uses detected project languages for language-based filtering.
 * Stage filtering is intentionally skipped at startup (stage is not known yet).
 */
export function getStartupRulePaths(
  rulesDir: string,
  detectedLanguages: string[],
): string[] {
  const selection = selectRulePaths(rulesDir, { languages: detectedLanguages })
  return selection.selected.map(r => r.path)
}

// Language detection

/**
 * Detect the primary programming languages used in a project by inspecting
 * known indicator files in the project root.
 * Returns lowercase language names matching the `languages` field in rule frontmatter.
 */
export function detectProjectLanguages(projectRoot: string): string[] {
  const mtime = getProjectMtime(projectRoot)
  const cached = _languageCache.get(projectRoot)
  if (cached && cached.mtime === mtime) return cached.languages

  const languages = _detectProjectLanguagesImpl(projectRoot)
  _languageCache.set(projectRoot, { languages, mtime })
  return languages
}

function _detectProjectLanguagesImpl(projectRoot: string): string[] {
  const langs: string[] = []

  // JavaScript / TypeScript
  if (existsSync(join(projectRoot, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"))
      const hasTsConfig = existsSync(join(projectRoot, "tsconfig.json"))
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      if (hasTsConfig || "typescript" in deps || "@types/node" in deps) {
        langs.push("typescript")
      } else {
        langs.push("javascript")
      }
    } catch {
      langs.push("javascript")
    }
  }

  // Go
  if (existsSync(join(projectRoot, "go.mod"))) {
    langs.push("go")
  }

  // Rust
  if (existsSync(join(projectRoot, "Cargo.toml"))) {
    langs.push("rust")
  }

  // Java / Kotlin
  if (
    existsSync(join(projectRoot, "pom.xml")) ||
    existsSync(join(projectRoot, "build.gradle")) ||
    existsSync(join(projectRoot, "build.gradle.kts"))
  ) {
    langs.push("java")
  }

  // Python
  if (
    existsSync(join(projectRoot, "requirements.txt")) ||
    existsSync(join(projectRoot, "pyproject.toml")) ||
    existsSync(join(projectRoot, "setup.py")) ||
    existsSync(join(projectRoot, "setup.cfg"))
  ) {
    langs.push("python")
  }

  return [...new Set(langs)]
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Build a human-readable diagnostic string for logging.
 * Reports how many rules were discovered, selected, and skipped with reasons.
 */
export function buildSelectionDiagnostics(
  selection: RuleSelection,
  context: SelectionContext,
): string {
  const lines: string[] = [
    `[LazyRuleLoader] discovered=${selection.total_discovered}` +
      ` selected=${selection.selected.length}` +
      ` skipped=${selection.skipped.length}`,
    `[LazyRuleLoader] context:` +
      ` languages=[${(context.languages ?? []).join(",")}]` +
      ` stage=${context.stage ?? "none"}`,
  ]
  for (const r of selection.selected) {
    lines.push(`[LazyRuleLoader] LOAD  ${basename(r.path)}: ${selection.reasons[r.path]}`)
  }
  for (const r of selection.skipped) {
    lines.push(`[LazyRuleLoader] SKIP  ${basename(r.path)}: ${selection.reasons[r.path]}`)
  }
  return lines.join("\n")
}

// ─── Cache control ────────────────────────────────────────────────────────────

/** Invalidate the discovery cache (call after rule files change, e.g. in tests). */
export function invalidateRuleCache(): void {
  _discoveryCache.clear()
  _languageCache.clear()
  _selectionCache.clear()
}

/** Return current cache entry counts (for tests/telemetry). */
export function getRuleCacheSize(): number {
  return _discoveryCache.size + _languageCache.size + _selectionCache.size
}
