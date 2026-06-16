import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, parseState, findWorkspaceRoot, getWorkspaceConfig } from "../tools/planning-state-lib"
import { codebaseDir } from "../tools/codebase-state"

const MAX_LESSON_SECTIONS = 10
const MAX_LESSON_CONTEXT_BYTES = 8 * 1024

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
 * HOOK-01: Session start state injection
 * Called on session.created event. Reads .planning/STATE.md and injects
 * phase/status/steps/last_action into context via return object.
 * Also checks .codebase/ existence per proposal spec line 397.
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

  // Load captured lessons for injection into the session context
  const lessonsPath = join(ctx.directory, ".flowdeck", "lessons.md")
  const rawLessonsContent = existsSync(lessonsPath) ? readFileSync(lessonsPath, "utf-8").trim() : ""
  const { cappedContent: lessonsContent, totalCount: lessonsCount } = rawLessonsContent
    ? capLessonsContent(rawLessonsContent)
    : { cappedContent: "", totalCount: 0 }
  if (log && lessonsCount > 0) {
    log(`[session-start] loaded ${lessonsCount} captured lesson(s) from .flowdeck/lessons.md`)
  }

  const lessonsContext: Record<string, unknown> = {
    flowdeck_lessons_count: lessonsCount,
    flowdeck_lessons: lessonsContent || null,
  }

  // No planning directory — fresh project, don't block
  if (!existsSync(planningDir)) {
    return {
      flowdeck_phase: null,
      flowdeck_status: "no_plan",
      flowdeck_warning: "Run /fd-map-codebase to index the codebase, then /fd-new-feature to start a feature.",
      flowdeck_has_codebase: existsSync(codebaseDirectory),
      ...lessonsContext,
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
      ...lessonsContext,
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
      ...lessonsContext,
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