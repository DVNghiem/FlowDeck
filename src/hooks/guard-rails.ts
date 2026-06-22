import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { findWorkspaceRoot, getWorkspaceConfig, phasePlanPath, readPlanningState } from "../tools/planning-state-lib"
import { codebaseDir } from "../tools/codebase-state"
import { isUiHeavyTask } from "../lib/task-routing"
import { loadFlowDeckConfig, resolveDesignFirstConfig } from "../config"

const PLANNING_DIR = ".planning"
const CONFIG_FILE = "config.json"
const STATE_FILE = "STATE.md"

/**
 * Safe Execution Mode — three tiers of AI edit safety.
 * auto:         AI can apply edits without confirmation (default, low-risk changes)
 * guarded:      AI applies with inline patch-trust warnings; requires human ACK for high-risk
 * review-only:  AI proposes diffs but cannot write files; human applies manually
 */
export type ExecutionMode = "auto" | "guarded" | "review-only"

/**
 * Derive execution mode from config and risk signals.
 * Priority: explicit config.execution_mode → volatility/trust override → plan_confirmed fallback.
 */
export function resolveExecutionMode(
  configPath: string,
  trustScore: number | null,  // 0–100, null = unknown
  volatility?: string         // "stable" | "moderate" | "volatile" | "critical"
): ExecutionMode {
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"))
      if (config.execution_mode === "review-only") return "review-only"
      if (config.execution_mode === "guarded") return "guarded"
      if (config.execution_mode === "auto") return "auto"
    } catch { /* fall through */ }
  }
  // Auto-switch based on trust score
  if (trustScore !== null) {
    if (trustScore < 30) return "review-only"
    if (trustScore < 60) return "guarded"
  }
  // Auto-switch based on file volatility
  if (volatility === "critical") return "review-only"
  if (volatility === "volatile") return "guarded"
  return "auto"
}

// Build/deploy command patterns for bash detection
const BUILD_DEPLOY_PATTERNS = [
  "npm build", "npm run build", "bun build", "yarn build",
  "npm deploy", "yarn deploy", "bun deploy",
  "npm install", "yarn install", "bun install",
  "make build", "make deploy",
  "docker build", "docker push", "docker-compose",
  "git push", "git deploy",
  "gradle build", "mvn package", "ant build",
  "cargo build", "cargo deploy",
  "python setup.py", "pip install",
  "rails deploy", "rake deploy",
]

export type Severity = "warn" | "block" | null

/**
 * HOOK-03: Guard rails enforcement
 * Warns on write/edit tools during setup phase (plan_confirmed=false).
 * Blocks on write/edit tools during execution phase (plan_confirmed=true).
 * Checks .codebase/ existence per proposal spec line 412.
 * Detects bash build/deploy commands per proposal spec line 416.
 * Respects guard_enforcement override in config.json.
 * Default is ON; disable with FLOWDECK_GUARD_RAILS_ENABLED=off.
 */

const isEnabled = (): boolean => process.env.FLOWDECK_GUARD_RAILS_ENABLED !== "off"
export async function guardRailsHook(
  ctx: { directory: string },
  input: { tool: string },
  _output: any
): Promise<void> {
  if (!isEnabled()) return

  const dir = ctx.directory
  const planningDirPath = join(dir, PLANNING_DIR)
  const codebaseDirectory = codebaseDir(dir)
  const configPath = join(planningDirPath, CONFIG_FILE)
  const statePath = join(planningDirPath, STATE_FILE)

  // HOOK-WS-02: Workspace-aware blocking for shared mode
  const workspaceRoot = findWorkspaceRoot(dir)
  if (workspaceRoot && dir !== workspaceRoot) {
    const config = getWorkspaceConfig(dir)
    if (config && config.workspace_mode === "shared" && !existsSync(planningDirPath)) {
      const msg = `No .planning/ in this sub-repo. Switch to workspace root: cd ${workspaceRoot}`
      throw new Error(`[flowdeck] BLOCK: ${msg}`)
    }
  }

  // Guard write/edit tools — only applies to FlowDeck-initialized projects
  if (input.tool === "write" || input.tool === "edit") {
    // No .planning/ directory means FlowDeck is not initialized here — skip silently
    if (!existsSync(planningDirPath)) return

    // Check .codebase/ existence — warn if missing (proposal spec line 412)
    if (!existsSync(codebaseDirectory)) {
      throw new Error(`[flowdeck] WARNING: .codebase/ not found. Run /fd-map-codebase to map the codebase.`)
    }

    // Resolve safe execution mode — switches between auto/guarded/review-only
    const execMode = resolveExecutionMode(configPath, null)
    if (execMode === "review-only") {
      throw new Error(`[flowdeck] BLOCK (review-only mode): propose diff but do not apply. Set execution_mode in .planning/config.json to change.`)
    }
    if (execMode === "guarded") {
      throw new Error(`[flowdeck] GUARDED MODE: edit will proceed but flag for human review.`)
    }

    const designGateMessage = getDesignGateMessage(dir)
    if (designGateMessage) {
      throw new Error(designGateMessage)
    }

    // Check guard_enforcement override
    const effectiveSeverity = getEffectiveSeverity(configPath, statePath)
    if (effectiveSeverity === null) return

    if (effectiveSeverity === "warn") {
      const warning = getWarningMessage(planningDirPath)
      throw new Error(`[flowdeck] WARNING: ${warning}`)
    }

    const blockMessage = getBlockMessage(planningDirPath)
    throw new Error(`[flowdeck] BLOCK: ${blockMessage}`)
  }

  // Guard bash build/deploy commands (proposal spec line 416)
  if (input.tool === "bash") {
    const cmd = (_output as any)?.args?.command || ""
    for (const pattern of BUILD_DEPLOY_PATTERNS) {
      if (cmd.includes(pattern)) {
        // Check if plan is confirmed before allowing build/deploy
        if (!getPlanConfirmed(statePath)) {
          throw new Error(`[flowdeck] WARNING: Build/deploy command detected but plan is not confirmed. Run /fd-plan first.`)
        }
        break
      }
    }
  }
}

function getDesignGateMessage(dir: string): string | null {
  const designConfig = resolveDesignFirstConfig(loadFlowDeckConfig(dir))
  if (!designConfig.enabled || !designConfig.requireApprovalBeforeImplementation) return null
  const state = readPlanningState(dir)
  if (state.design_override && state.design_override_reason && state.design_override_reason.trim().length > 0) return null

  const designApproved = state.design_stage === "handoff_complete" && state.design_approved
  if (state.requires_design_first || (state.task_type && isUiHeavyTask(state.task_type)) || planSuggestsUiHeavy(dir, state.phase || 1)) {
    if (designApproved) return null
    if (designConfig.enforcement === "advisory") {
      return "[flowdeck] WARNING: UI-heavy task detected without approved design handoff. Run /fd-design --mode=draft first."
    }
    return "[flowdeck] BLOCK: UI-heavy task requires approved design handoff. Run /fd-design --mode=draft or set explicit design override in STATE.md."
  }
  return null
}

function planSuggestsUiHeavy(dir: string, phase: number): boolean {
  const planPath = phasePlanPath(dir, phase)
  if (!existsSync(planPath)) return false
  const planContent = readFileSync(planPath, "utf-8")
  return isUiHeavyTask(planContent)
}

/**
 * Determine effective severity based on config.json override or STATE.md plan_confirmed.
 */
export function effectiveSeverity(configPath: string, statePath: string): Severity {
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, "utf-8")
      const config = JSON.parse(configContent)
      if (config.guard_enforcement === "warn") return "warn"
      if (config.guard_enforcement === "block") return "block"
      if (config.guard_enforcement === "off") return null
    } catch { /* fall through */ }
  }
  return getPlanConfirmed(statePath) ? "block" : "warn"
}

function getEffectiveSeverity(configPath: string, statePath: string): Severity {
  return effectiveSeverity(configPath, statePath)
}

export function getPlanConfirmed(statePath: string): boolean {
  if (!existsSync(statePath)) return false
  try {
    const content = readFileSync(statePath, "utf-8")
    const match = content.match(/plan_confirmed:\s*(true|false)/i)
    return match ? match[1].toLowerCase() === "true" : false
  } catch {
    return false
  }
}

function getWarningMessage(planningDir: string): string {
  if (!existsSync(join(planningDir, STATE_FILE))) {
    return "No STATE.md found. Run /fd-map-codebase then /fd-new-feature to start a feature."
  }
  return "Plan not confirmed. Run /fd-plan and confirm to enable execution."
}

function getBlockMessage(planningDir: string): string {
  if (!existsSync(join(planningDir, STATE_FILE))) {
    return "No STATE.md found. Run /fd-map-codebase then /fd-new-feature to start a feature."
  }
  return "Plan not confirmed. Run /fd-plan and confirm to enable execution."
}
