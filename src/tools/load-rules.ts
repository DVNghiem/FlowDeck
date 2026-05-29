/**
 * Load Rules Tool
 *
 * On-demand rule loading for agents. Allows an agent to explicitly request
 * the full content of rule modules that were not injected at startup (because
 * they are stage-restricted and the stage was not known at plugin init time).
 *
 * Usage pattern:
 *   1. At startup only always_on + language-matching rules are injected globally.
 *   2. When an agent begins work (e.g. a coder starting the execute stage),
 *      it calls this tool to load coding-style, security, and testing rules.
 *   3. The tool returns full rule content and logs which modules were loaded.
 *
 * This keeps the global instruction context minimal while ensuring agents get
 * the right guidance when they actually need it.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import {
  discoverRules,
  selectRulePaths,
  buildSelectionDiagnostics,
  type RuleMetadata,
} from "../services/lazy-rule-loader"

const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "rules")

/** In-session cache: tracks what has already been loaded to suppress reloads. */
const _loadedPaths = new Set<string>()

/** Reset the loaded-paths cache (for testing). */
export function resetLoadedRulesCache(): void {
  _loadedPaths.clear()
}

/** Return a copy of currently loaded paths (for testing/diagnostics). */
export function getLoadedRulePaths(): string[] {
  return [..._loadedPaths]
}

export const loadRulesTool: ToolDefinition = tool({
  description:
    "Load additional rule modules on demand for the current workflow stage. " +
    "Use this at the start of a new stage (execute, verify, fix-bug) to load " +
    "coding-style, security, testing, and language-specific rules that were not " +
    "injected at startup. Returns the full text of selected rules. " +
    "Already-loaded rules are not returned again (suppressed to avoid duplication).",
  args: {
    stage: tool.schema
      .string()
      .optional()
      .describe(
        "Current workflow stage: discuss | plan | execute | verify | fix-bug | write-docs",
      ),
    languages: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe(
        "Project languages to load rules for, e.g. ['typescript']. " +
        "Omit to use all languages (returns all matching stage rules).",
      ),
    force_reload: tool.schema
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, return rules even if they were already loaded in this session. " +
        "Use only when stage context has changed and you need a fresh load.",
      ),
  },
  async execute(args): Promise<string> {
    const rulesDir = existsSync(RULES_DIR) ? RULES_DIR : null
    if (!rulesDir) {
      return JSON.stringify({
        loaded: [],
        skipped_already_loaded: [],
        skipped_no_match: [],
        content: "",
        error: `Rules directory not found at ${RULES_DIR}`,
      })
    }

    const context = {
      stage: args.stage,
      languages: args.languages,
    }

    const selection = selectRulePaths(rulesDir, context)
    const diagnostics = buildSelectionDiagnostics(selection, context)

    const loaded: string[] = []
    const skippedAlreadyLoaded: string[] = []
    const contents: string[] = []

    for (const rule of selection.selected) {
      const name = ruleShortName(rule)

      if (!args.force_reload && _loadedPaths.has(rule.path)) {
        skippedAlreadyLoaded.push(name)
        continue
      }

      try {
        const text = readFileSync(rule.path, "utf-8")
        contents.push(`## ${name}\n\n${text}`)
        _loadedPaths.add(rule.path)
        loaded.push(name)
      } catch {
        loaded.push(`${name} (read error)`)
      }
    }

    const skippedNoMatch = selection.skipped.map(r => ({
      name: ruleShortName(r),
      reason: selection.reasons[r.path],
    }))

    return JSON.stringify({
      loaded,
      skipped_already_loaded: skippedAlreadyLoaded,
      skipped_no_match: skippedNoMatch,
      total_available: selection.total_discovered,
      diagnostics,
      content: contents.join("\n\n---\n\n"),
    })
  },
})

/** Build a short human-readable name for a rule (e.g. "typescript/patterns"). */
function ruleShortName(rule: RuleMetadata): string {
  // Remove the RULES_DIR prefix and .md suffix for readability
  return rule.path
    .replace(RULES_DIR + "/", "")
    .replace(/\.md$/, "")
}

/** Query-only tool: list all available rule modules with their metadata summaries. */
export const listRulesTool: ToolDefinition = tool({
  description:
    "List all available FlowDeck rule modules with their metadata (description, always_on, " +
    "stages, languages). Use this before calling load-rules to see what is available. " +
    "Does NOT load rule content — only returns metadata for discovery.",
  args: {},
  async execute(): Promise<string> {
    const rulesDir = existsSync(RULES_DIR) ? RULES_DIR : null
    if (!rulesDir) {
      return JSON.stringify({ rules: [], error: `Rules directory not found at ${RULES_DIR}` })
    }

    const all = discoverRules(rulesDir)
    return JSON.stringify({
      total: all.length,
      rules: all.map(r => ({
        name: r.path.replace(RULES_DIR + "/", "").replace(/\.md$/, ""),
        description: r.description,
        always_on: r.always_on,
        stages: r.stages,
        languages: r.languages,
        loaded: _loadedPaths.has(r.path),
      })),
    })
  },
})
