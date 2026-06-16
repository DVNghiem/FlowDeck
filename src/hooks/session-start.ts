import { existsSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { statePath, parseState, findWorkspaceRoot, getWorkspaceConfig } from "../tools/planning-state-lib"
import { codebaseDir } from "../tools/codebase-state"
import {
  detectProjectLanguages,
  getStartupRulePaths,
} from "../services/lazy-rule-loader"

const MAX_LESSON_SECTIONS = 10
const MAX_LESSON_CONTEXT_BYTES = 8 * 1024

/**
 * Resolve the absolute path of the FlowDeck rules directory.
 *
 * The rules ship inside the package under `src/rules`. Depending on whether
 * the module is running as a bundled production artifact (entry file under
 * `dist/`) or as a source-level test (entry file under `src/hooks/`), the
 * path differs. Probe both candidates and fall back to the production path.
 */
function resolveRulesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "..", "src", "rules"),       // dist/hooks/ -> src/rules
    join(here, "..", "..", "src", "rules"), // src/hooks/  -> src/rules
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

/**
 * Split a lessons markdown file into sections starting with "## " and return
 * the most recent sections while keeping the total size under a byte cap.
 */
function capLessonsContent(content: string): { cappedContent: string; totalCount: number } {
  const sections = content.split(/\n(?=## )/).filter(Boolean)
  const totalCount = sections.length
  if (totalCount === 0) return { cappedContent: "", totalCount: 0 }

  const recentSections = sections.slice(-MAX_LESSON_SECTIONS)
  let cappedContent = recentSections.join("\n\n").trim()
  if (Buffer.byteLength(cappedContent, "utf-8") > MAX_LESSON_CONTEXT_BYTES) {
    // Drop oldest sections one at a time until under the cap.
    let kept = recentSections
    while (kept.length > 1 && Buffer.byteLength(kept.join("\n\n").trim(), "utf-8") > MAX_LESSON_CONTEXT_BYTES) {
      kept = kept.slice(1)
    }
    cappedContent = kept.join("\n\n").trim()
  }
  return { cappedContent, totalCount }
}

/**
 * Build the lean context payload for a session start: lessons + language rules.
 *
 * - Reads `.flowdeck/lessons.md` from the project root if it exists.
 * - Detects project languages and returns the matching rule paths via the
 *   lazy-rule-loader cache (keyed by project root, invalidated when the
 *   `package.json` / `Cargo.toml` / `go.mod` / `pyproject.toml` mtime changes).
 *
 * Agents read full rule content on demand via the `load-rules` tool.
 */
function buildLeanContext(projectRoot: string, log?: (msg: string) => void | Promise<void>): Record<string, unknown> {
  // ── Lessons ───────────────────────────────────────────────────────────────
  const lessonsPath = join(projectRoot, ".flowdeck", "lessons.md")
  const rawLessonsContent = existsSync(lessonsPath) ? readFileSync(lessonsPath, "utf-8").trim() : ""
  const { cappedContent: lessonsContent, totalCount: lessonsCount } = rawLessonsContent
    ? capLessonsContent(rawLessonsContent)
    : { cappedContent: "", totalCount: 0 }
  if (log && lessonsCount > 0) {
    log(`[session-start] loaded ${lessonsCount} captured lesson(s) from .flowdeck/lessons.md`)
  }

  // ── Language rules (cached by project root + manifest mtime) ──────────────
  let languages: string[] = []
  let rulePaths: string[] = []
  try {
    languages = detectProjectLanguages(projectRoot)
    const rulesDir = resolveRulesDir()
    if (existsSync(rulesDir) && languages.length > 0) {
      rulePaths = getStartupRulePaths(rulesDir, languages)
    }
    if (log) {
      log(
        `[session-start] detected languages=[${languages.join(",") || "none"}]` +
          ` selected ${rulePaths.length} language rule(s) from cache`,
      )
    }
  } catch (err) {
    if (log) log(`[session-start] rule selection failed: ${(err as Error).message}`)
  }

  return {
    flowdeck_lessons_count: lessonsCount,
    flowdeck_lessons: lessonsContent || null,
    flowdeck_languages: languages,
    flowdeck_rule_paths: rulePaths,
  }
}

/**
 * HOOK-01: Session start state injection
 * Called on session.created event. Reads .planning/STATE.md and injects
 * phase/status/steps/last_action into context via return object.
 * Also checks .codebase/ existence per proposal spec line 397.
 *
 * Step 4: In addition to planning state, returns a lean context payload
 * containing `.flowdeck/lessons.md` content and the language-specific rule
 * paths selected by the lazy-rule-loader cache.
 */
export async function sessionStartHook(
  ctx: { directory: string },
  log?: (msg: string) => void | Promise<void>,
): Promise<Record<string, unknown>> {
  const planningDir = ctx.directory + "/.planning"
  const codebaseDirectory = codebaseDir(ctx.directory)

  // Detect workspace root and inject workspace context
  const workspaceRoot = findWorkspaceRoot(ctx.directory)
  const config = workspaceRoot ? getWorkspaceConfig(ctx.directory) : null

  // Lean context: lessons + language rules (reuses lazy-rule-loader cache).
  const leanContext = buildLeanContext(ctx.directory, log)

  // No planning directory — fresh project, don't block
  if (!existsSync(planningDir)) {
    return {
      flowdeck_phase: null,
      flowdeck_status: "no_plan",
      flowdeck_warning: "Run /fd-map-codebase to index the codebase, then /fd-new-feature to start a feature.",
      flowdeck_has_codebase: existsSync(codebaseDirectory),
      ...leanContext,
      ...(workspaceRoot && config?.sub_repos ? {
        flowdeck_workspace_root: workspaceRoot,
        flowdeck_sub_repos: config.sub_repos,
        flowdeck_workspace_mode: config.workspace_mode,
        flowdeck_is_workspace_root: ctx.directory === workspaceRoot,
      } : {}),
    }
  }

  try {
    const stateFilePath = statePath(ctx.directory)
    const content = readFileSync(stateFilePath, "utf-8")
    const state = parseState(content)

    const currentPhase = (state["current_phase"] || {}) as Record<string, unknown>

    const result: Record<string, unknown> = {
      flowdeck_phase: currentPhase["phase"] ?? null,
      flowdeck_status: currentPhase["status"] ?? null,
      flowdeck_steps_pending: currentPhase["steps_pending"] ?? null,
      flowdeck_last_action: currentPhase["last_action"] ?? null,
      flowdeck_has_codebase: existsSync(codebaseDirectory),
      ...leanContext,
    }

    // HOOK-WS-01: Inject workspace context if workspace detected
    if (workspaceRoot && config?.sub_repos && config.sub_repos.length > 0) {
      result.flowdeck_workspace_root = workspaceRoot
      result.flowdeck_sub_repos = config.sub_repos
      result.flowdeck_workspace_mode = config.workspace_mode
      result.flowdeck_is_workspace_root = ctx.directory === workspaceRoot
    }

    return result
  } catch {
    // Corrupted/unreadable state — continue without context; the returned warning
    // field communicates the issue to the agent without writing to raw stdout.
    const result: Record<string, unknown> = {
      flowdeck_phase: null,
      flowdeck_status: "error",
      flowdeck_warning: "State file unreadable. Continuing without flowdeck context.",
      flowdeck_has_codebase: existsSync(codebaseDirectory),
      ...leanContext,
    }
    // HOOK-WS-01: Inject workspace context even on error
    if (workspaceRoot && config?.sub_repos && config.sub_repos.length > 0) {
      result.flowdeck_workspace_root = workspaceRoot
      result.flowdeck_sub_repos = config.sub_repos
      result.flowdeck_workspace_mode = config.workspace_mode
      result.flowdeck_is_workspace_root = ctx.directory === workspaceRoot
    }
    return result
  }
}
