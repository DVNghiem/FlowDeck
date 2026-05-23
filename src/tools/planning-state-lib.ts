import { join, dirname, resolve } from "path"
import { readFileSync, writeFileSync, existsSync } from "fs"

const PLANNING_DIR = ".planning"
const STATE_FILE = "STATE.md"
const PLAN_FILE = "PLAN.md"
const RESULT_FILE = "RESULT.md"

export { codebaseDir } from "./codebase-state"

export function planningDir(directory: string): string {
  return join(directory, PLANNING_DIR)
}

export function statePath(directory: string): string {
  return join(planningDir(directory), STATE_FILE)
}

export function phasePlanPath(directory: string, phase: number): string {
  return join(planningDir(directory), "phases", `phase-${phase}`, PLAN_FILE)
}

export function resultPath(directory: string, phase: number): string {
  return join(planningDir(directory), "phases", `phase-${phase}`, RESULT_FILE)
}

export interface TDDState {
  /** Current stage: 'behavior' | 'red' | 'green' | 'refactor' | 'complete' */
  stage: "behavior" | "red" | "green" | "refactor" | "complete"
  /** Current cycle number (1-based) */
  cycle: number
  /** Behaviors defined for current feature/bug */
  behaviors: TDDBehavior[]
  /** Test file paths linked to current session */
  regression_test_links: string[]
  /** Override decisions with reasons */
  override_log: TDDOverride[]
  /** Failing test count */
  failing_tests: number
  /** Passing test count */
  passing_tests: number
}

export interface TDDBehavior {
  id: string
  description: string
  status: "pending" | "red" | "green" | "refactor" | "complete"
  test_file?: string
}

export interface TDDOverride {
  timestamp: string
  stage: string
  reason: string
  override_by: string
}

export interface PlanningState {
  phase: number
  status: string
  plan_confirmed: boolean
  task_type?: string
  requires_design_first: boolean
  design_stage: "pending" | "discovery" | "ux_planning" | "wireframe_layout" | "visual_system_definition" | "design_approval" | "handoff_complete"
  design_approved: boolean
  design_override: boolean
  design_override_reason?: string
  design_artifact?: string
  steps_complete: number[]
  steps_pending: number[]
  last_action: string
  next_action: string
  blockers: string[]
  /** TDD workflow state (undefined when TDD not active) */
  tdd: TDDState | undefined
  /** When this state was last updated */
  lastUpdatedAt: string
  /** Which agent last updated the state */
  lastUpdatedBy: string
  /** Phase when state was last updated */
  lastUpdatedPhase: number
  /** Monotonically increasing version number */
  summaryVersion: number
  /** Whether the state is still considered fresh enough to use */
  freshnessStatus: "fresh" | "stale" | "unknown"
}

/** Extended PlanningState with TDD state for internal use */
export type PlanningStateWithTDD = PlanningState & { tdd: TDDState }

export function getTDDState(state: PlanningState): TDDState | undefined {
  const tdd = state["tdd"]
  return typeof tdd === "object" ? tdd as TDDState : undefined
}

export function parseState(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = { exists: false }

  // Strip YAML frontmatter and parse its top-level scalar keys
  let body = content
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (frontmatterMatch) {
    body = frontmatterMatch[2]
    for (const line of frontmatterMatch[1].split("\n")) {
      const fm = line.match(/^([a-z_][a-z0-9_]*):\s*(.+)/)
      if (fm) {
        result[fm[1].trim()] = fm[2].trim().replace(/^["']|["']$/g, "")
      }
    }
  }

  // Parse key:value pairs from body — flattened to top level (overrides frontmatter)
  for (const line of body.split("\n")) {
    if (line.startsWith("#")) continue
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/)
    if (kvMatch) {
      const key = kvMatch[1].trim()
      const value = kvMatch[2].trim()
      if (key === "steps_complete" || key === "steps_pending") {
        result[key] = value.replace(/[\[\]]/g, "").split(",").map(s => s.trim()).filter(Boolean)
      } else if (key === "plan_confirmed") {
        result[key] = value === "true"
      } else if (key === "requires_design_first" || key === "design_approved" || key === "design_override") {
        result[key] = value === "true"
      } else if (value !== "" && !isNaN(Number(value)) && key !== "plan_file" && key !== "confirmed_at") {
        result[key] = Number(value)
      } else {
        result[key] = value.replace(/^["']|["']$/g, "")
      }
    }
  }

  result["exists"] = true
  return result
}

export function timestamp(): string {
  return new Date().toISOString()
}

/**
 * Update or insert a key:value line in state content.
 */
function upsertLine(current: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}:\\s*.*$`, "m")
  if (pattern.test(current)) return current.replace(pattern, `${key}: ${value}`)
  return `${current.trimEnd()}\n${key}: ${value}\n`
}

/**
 * Returns true if state was updated within maxAgeMs milliseconds.
 * Defaults to 5 minutes.
 */
export function isStateFresh(state: PlanningState, maxAgeMs = 5 * 60 * 1000): boolean {
  if (!state.lastUpdatedAt) return false
  if (state.freshnessStatus === "stale") return false
  const age = Date.now() - new Date(state.lastUpdatedAt).getTime()
  return age < maxAgeMs
}

/**
 * Mark the state as stale by updating freshnessStatus and appending to history.
 */
export function markStateStale(dir: string): void {
  const sp = statePath(dir)
  if (!existsSync(sp)) return
  let content = readFileSync(sp, "utf-8")
  content = upsertLine(content, "freshnessStatus", "stale")
  content = appendHistory(content, "State marked stale — re-exploration required")
  writeFileSync(sp, content, "utf-8")
}

/**
 * Publish a state update with fresh metadata. Called after any significant change.
 */
export function publishStateUpdate(dir: string, agent: string, phase: number): void {
  const sp = statePath(dir)
  if (!existsSync(sp)) return
  let content = readFileSync(sp, "utf-8")
  const now = timestamp()

  // Extract current version or start at 0
  const currentVersion = parseInt(content.match(/^summaryVersion:\s*(\d+)/m)?.[1] || "0", 10)
  const newVersion = currentVersion + 1

  content = upsertLine(content, "lastUpdatedAt", `"${now}"`)
  content = upsertLine(content, "lastUpdatedBy", `"${agent}"`)
  content = upsertLine(content, "lastUpdatedPhase", `${phase}`)
  content = upsertLine(content, "summaryVersion", `${newVersion}`)
  content = upsertLine(content, "freshnessStatus", "fresh")
  content = appendHistory(content, `State published by ${agent} at phase ${phase} (v${newVersion})`)

  writeFileSync(sp, content, "utf-8")
}

export function appendHistory(stateContent: string, action: string): string {
  const entry = `- ${timestamp()} — ${action}`
  if (stateContent.includes("## Session History")) {
    return stateContent.replace(/(\n## Session History\n)/, `$1${entry}\n`)
  }
  return stateContent + `\n## Session History\n${entry}\n`
}

export function readPlanningState(dir: string): PlanningState {
  const sp = statePath(dir)
  if (!existsSync(sp)) {
    return {
      phase: 0,
      status: "",
      plan_confirmed: false,
      requires_design_first: false,
      design_stage: "pending",
      design_approved: false,
      design_override: false,
      steps_complete: [],
      steps_pending: [],
      last_action: "",
      next_action: "",
      blockers: [],
      tdd: undefined,
      lastUpdatedAt: "",
      lastUpdatedBy: "",
      lastUpdatedPhase: 1,
      summaryVersion: 0,
      freshnessStatus: "unknown" as const,
    }
  }
  const content = readFileSync(sp, "utf-8")
  const parsed = parseState(content)
  return {
    phase: (parsed.phase as number) || 1,
    status: (parsed.status as string) || "",
    plan_confirmed: Boolean(parsed.plan_confirmed),
    task_type: (parsed.task_type as string) || undefined,
    requires_design_first: Boolean(parsed.requires_design_first),
    design_stage: ((parsed.design_stage as PlanningState["design_stage"]) || "pending"),
    design_approved: Boolean(parsed.design_approved),
    design_override: Boolean(parsed.design_override),
    design_override_reason: (parsed.design_override_reason as string) || undefined,
    design_artifact: (parsed.design_artifact as string) || undefined,
    steps_complete: (parsed.steps_complete as number[]) || [],
    steps_pending: (parsed.steps_pending as number[]) || [],
    last_action: (parsed.last_action as string) || "",
    next_action: (parsed.next_action as string) || "",
    blockers: (parsed.blockers as string[]) || [],
    tdd: parseTDDState(parsed),
    lastUpdatedAt: (parsed.lastUpdatedAt as string) || "",
    lastUpdatedBy: (parsed.lastUpdatedBy as string) || "",
    lastUpdatedPhase: (parsed.lastUpdatedPhase as number) || 1,
    summaryVersion: (parsed.summaryVersion as number) || 0,
    freshnessStatus: ((parsed.freshnessStatus as "fresh" | "stale" | "unknown") || "unknown") as PlanningState["freshnessStatus"],
  }
}

export function hasDesignGateSatisfied(state: PlanningState): boolean {
  if (!state.requires_design_first) return true
  if (state.design_override) return true
  return state.design_stage === "handoff_complete" && state.design_approved
}

/**
 * Parse TDD state from parsed STATE.md fields.
 */
function parseTDDState(parsed: Record<string, unknown>): TDDState | undefined {
  const tdd = parsed.tdd as string | undefined
  if (!tdd) return undefined

  try {
    const obj = JSON.parse(tdd)
    return {
      stage: (obj.stage as TDDState["stage"]) || "behavior",
      cycle: (obj.cycle as number) || 1,
      behaviors: (obj.behaviors as TDDBehavior[]) || [],
      regression_test_links: (obj.regression_test_links as string[]) || [],
      override_log: (obj.override_log as TDDOverride[]) || [],
      failing_tests: (obj.failing_tests as number) || 0,
      passing_tests: (obj.passing_tests as number) || 0,
    }
  } catch {
    return undefined
  }
}

/**
 * Serialize TDD state to JSON string for storage.
 */
function serializeTDDState(tdd: TDDState): string {
  return JSON.stringify({
    stage: tdd.stage,
    cycle: tdd.cycle,
    behaviors: tdd.behaviors,
    regression_test_links: tdd.regression_test_links,
    override_log: tdd.override_log,
    failing_tests: tdd.failing_tests,
    passing_tests: tdd.passing_tests,
  })
}

export function updateTDDState(dir: string, updates: Partial<TDDState>): void {
  const sp = statePath(dir)
  if (!existsSync(sp)) return

  const state = readPlanningState(dir)
  const existingTdd = state["tdd"] as TDDState | undefined
  const current: TDDState = existingTdd ?? {
    stage: "behavior",
    cycle: 1,
    behaviors: [],
    regression_test_links: [],
    override_log: [],
    failing_tests: 0,
    passing_tests: 0,
  }

  const updated: TDDState = { ...current, ...updates }
  const tddJson = serializeTDDState(updated)

  let content = readFileSync(sp, "utf-8")

  // Update or insert tdd field in frontmatter
  if (content.includes("tdd:")) {
    content = content.replace(/^tdd:.*$/m, `tdd: '${tddJson}'`)
  } else if (content.startsWith("---")) {
    const end = content.indexOf("---", 3)
    if (end !== -1) {
      content = content.slice(0, end) + "\ntdd: '" + tddJson.replace(/'/g, "''") + "'" + content.slice(end)
    }
  }

  content = appendHistory(content, `TDD state updated: stage=${updated.stage}, cycle=${updated.cycle}`)
  writeFileSync(sp, content, "utf-8")
}

export function logTDDOverride(dir: string, stage: string, reason: string, override_by: string): void {
  const state = readPlanningState(dir)
  const existingTdd = state["tdd"] as TDDState | undefined
  if (!existingTdd) return

  const override: TDDOverride = {
    timestamp: timestamp(),
    stage,
    reason,
    override_by,
  }

  updateTDDState(dir, {
    override_log: [...existingTdd.override_log, override],
  })
}

export function updatePlanningState(dir: string, updates: Partial<PlanningState>): void {
  const sp = statePath(dir)
  if (!existsSync(sp)) return
  let content = readFileSync(sp, "utf-8")

  if (updates.phase !== undefined) {
    content = upsertLine(content, "phase", `${updates.phase}`)
    content = appendHistory(content, `Phase changed to ${updates.phase}`)
  }
  if (updates.status !== undefined) {
    content = upsertLine(content, "status", `${updates.status}`)
    content = appendHistory(content, `Status changed to ${updates.status}`)
  }
  if (updates.last_action !== undefined) {
    content = upsertLine(content, "last_action", `"${updates.last_action}"`)
    content = appendHistory(content, updates.last_action)
  }
  if (updates.next_action !== undefined) {
    content = upsertLine(content, "next_action", `"${updates.next_action}"`)
    content = appendHistory(content, `Next action: ${updates.next_action}`)
  }
  if (updates.blockers !== undefined) {
    const blockersMd = updates.blockers.length > 0
      ? updates.blockers.map(b => `- ${b}`).join("\n")
      : "- none"
    content = content.replace(/^## Blockers\n[\s\S]*?(?=\n##|\n#$)/m, `## Blockers\n${blockersMd}\n`)
    content = appendHistory(content, `Blockers updated: ${updates.blockers.length} item(s)`)
  }
  if (updates.plan_confirmed !== undefined) {
    content = upsertLine(content, "plan_confirmed", `${updates.plan_confirmed}`)
    content = appendHistory(content, `Plan confirmed: ${updates.plan_confirmed}`)
  }
  if (updates.task_type !== undefined) {
    content = upsertLine(content, "task_type", `"${updates.task_type}"`)
    content = appendHistory(content, `Task type set: ${updates.task_type}`)
  }
  if (updates.requires_design_first !== undefined) {
    content = upsertLine(content, "requires_design_first", `${updates.requires_design_first}`)
    content = appendHistory(content, `requires_design_first: ${updates.requires_design_first}`)
  }
  if (updates.design_stage !== undefined) {
    content = upsertLine(content, "design_stage", `"${updates.design_stage}"`)
    content = appendHistory(content, `design_stage: ${updates.design_stage}`)
  }
  if (updates.design_approved !== undefined) {
    content = upsertLine(content, "design_approved", `${updates.design_approved}`)
    content = appendHistory(content, `design_approved: ${updates.design_approved}`)
  }
  if (updates.design_override !== undefined) {
    content = upsertLine(content, "design_override", `${updates.design_override}`)
    content = appendHistory(content, `design_override: ${updates.design_override}`)
  }
  if (updates.design_override_reason !== undefined) {
    content = upsertLine(content, "design_override_reason", `"${updates.design_override_reason}"`)
    content = appendHistory(content, `design_override_reason updated`)
  }
  if (updates.design_artifact !== undefined) {
    content = upsertLine(content, "design_artifact", `'${updates.design_artifact.replace(/'/g, "''")}'`)
    content = appendHistory(content, `design_artifact updated`)
  }
  if (updates.steps_complete !== undefined) {
    content = upsertLine(content, "steps_complete", `[${updates.steps_complete.join(", ")}]`)
    content = appendHistory(content, `Steps complete: [${updates.steps_complete.join(", ")}]`)
  }
  if (updates.steps_pending !== undefined) {
    content = upsertLine(content, "steps_pending", `[${updates.steps_pending.join(", ")}]`)
    content = appendHistory(content, `Steps pending: [${updates.steps_pending.join(", ")}]`)
  }
  // Always update freshness metadata when state is updated
  const now = timestamp()
  const currentPhase = (parseState(readFileSync(sp, "utf-8")).phase as number) || 1
  const currentVersionMatch = content.match(/^summaryVersion:\s*(\d+)/m)
  const currentVersion = currentVersionMatch ? parseInt(currentVersionMatch[1], 10) : 0
  const newVersion = currentVersion + 1

  content = upsertLine(content, "lastUpdatedAt", `"${now}"`)
  content = upsertLine(content, "lastUpdatedBy", `"system"`)
  content = upsertLine(content, "lastUpdatedPhase", `${currentPhase}`)
  content = upsertLine(content, "summaryVersion", `${newVersion}`)
  content = upsertLine(content, "freshnessStatus", "fresh")
  content = appendHistory(content, `Freshness updated by system at phase ${currentPhase} (v${newVersion})`)
  writeFileSync(sp, content, "utf-8")
}

export function findWorkspaceRoot(startDir: string): string | null {
  let current = startDir
  for (;;) {
    const configPath = join(current, ".planning", "config.json")
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"))
        if (config.sub_repos && Array.isArray(config.sub_repos) && config.sub_repos.length > 0) {
          return current
        }
      } catch { /* ignore */ }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

export function resolveSubRepos(configPath: string, subRepos: string[]): string[] {
  const configDir = dirname(configPath)
  return subRepos.map(r => {
    if (resolve(r) === r) return r
    return resolve(configDir, r)
  })
}

export function getWorkspaceConfig(dir: string): { sub_repos: string[] | null, workspace_mode: "shared" | "per-repo", workspace_root?: string } | null {
  const root = findWorkspaceRoot(dir)
  if (!root) return null
  const configPath = join(root, ".planning", "config.json")
  if (!existsSync(configPath)) return null
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"))
    return {
      sub_repos: Array.isArray(config.sub_repos) ? config.sub_repos : null,
      workspace_mode: (config.workspace_mode === "per-repo" ? "per-repo" : "shared"),
      workspace_root: config.workspace_root || undefined,
    }
  } catch {
    return null
  }
}
