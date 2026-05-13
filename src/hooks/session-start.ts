import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, parseState, findWorkspaceRoot, getWorkspaceConfig } from "../tools/planning-state-lib"
import { codebaseDir } from "../tools/codebase-state"

/**
 * HOOK-01: Session start state injection
 * Called on session.created event. Reads .planning/STATE.md and injects
 * phase/status/steps/last_action into context via return object.
 * Also checks .codebase/ existence per proposal spec line 397.
 */
export async function sessionStartHook(
  ctx: { directory: string }
): Promise<Record<string, unknown>> {
  const planningDir = ctx.directory + "/.planning"
  const codebaseDirectory = codebaseDir(ctx.directory)

  // Detect workspace root and inject workspace context
  const workspaceRoot = findWorkspaceRoot(ctx.directory)
  const config = workspaceRoot ? getWorkspaceConfig(ctx.directory) : null

  // No planning directory — fresh project, don't block
  if (!existsSync(planningDir)) {
    return {
      flowdeck_phase: null,
      flowdeck_status: "no_plan",
      flowdeck_warning: "Run /fd-new-project or /fd-map-codebase to initialize.",
      flowdeck_has_codebase: existsSync(codebaseDirectory),
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
    }

    // HOOK-WS-01: Inject workspace context if workspace detected
    if (workspaceRoot && config?.sub_repos && config.sub_repos.length > 0) {
      result.flowdeck_workspace_root = workspaceRoot
      result.flowdeck_sub_repos = config.sub_repos
      result.flowdeck_workspace_mode = config.workspace_mode
      result.flowdeck_is_workspace_root = ctx.directory === workspaceRoot
    }

    return result
  } catch (err) {
    // Corrupted/unreadable state — warn and continue, don't block
    console.warn("[flowdeck] Warning: State file unreadable. Continuing without flowdeck context.")
    const result: Record<string, unknown> = {
      flowdeck_phase: null,
      flowdeck_status: "error",
      flowdeck_warning: "State file unreadable. Continuing without flowdeck context.",
      flowdeck_has_codebase: existsSync(codebaseDirectory),
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