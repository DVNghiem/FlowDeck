import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs"
import { join } from "path"
import type { TaskState } from "../types"

const PLAN_DIR = ".fd-plan"

/** Resolve .fd-plan/<slug>/ directory path */
export function taskDir(root: string, slug: string): string {
  return join(root, PLAN_DIR, slug)
}

/** List all task slugs that have a plan dir under .fd-plan/ */
export function listTasks(root: string): string[] {
  const planPath = join(root, PLAN_DIR)
  if (!existsSync(planPath)) return []
  return readdirSync(planPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

/** Read TaskState from .fd-plan/<slug>/.state.json */
export function readTaskState(root: string, slug: string): TaskState | null {
  const statePath = join(taskDir(root, slug), ".state.json")
  if (!existsSync(statePath)) return null
  try {
    const content = readFileSync(statePath, "utf-8")
    return JSON.parse(content) as TaskState
  } catch {
    return null
  }
}

/** Write TaskState to .fd-plan/<slug>/.state.json */
export function writeTaskState(root: string, state: TaskState): void {
  const dir = taskDir(root, state.slug)
  mkdirSync(dir, { recursive: true })
  const statePath = join(dir, ".state.json")
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8")
}

/** Build the canonical file path for a plan artifact */
export function planFilePath(
  root: string,
  slug: string,
  date: string,
  kind: "research" | "architect-affect" | "design" | "plan" | "qa" | "learning"
): string {
  // Returns: .fd-plan/<slug>/YYYY-MM-DD-<slug>-<kind>.md
  const filename = `${date}-${slug}-${kind}.md`
  return join(root, PLAN_DIR, slug, filename)
}

/** Read a plan artifact file. Returns null if not found. */
export function readPlanFile(
  root: string,
  slug: string,
  date: string,
  kind: "research" | "architect-affect" | "design" | "plan" | "qa" | "learning"
): string | null {
  const path = planFilePath(root, slug, date, kind)
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, "utf-8")
  } catch {
    return null
  }
}

/** Write a plan artifact file. Creates directory if needed. */
export function writePlanFile(
  root: string,
  slug: string,
  date: string,
  kind: "research" | "architect-affect" | "design" | "plan" | "qa" | "learning",
  content: string
): void {
  const dir = taskDir(root, slug)
  mkdirSync(dir, { recursive: true })
  const path = planFilePath(root, slug, date, kind)
  writeFileSync(path, content, "utf-8")
}

/** Read the project-level architect.md */
export function readProjectArchitect(root: string): string | null {
  const path = join(root, PLAN_DIR, "architect.md")
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, "utf-8")
  } catch {
    return null
  }
}

/** Append to project-level .fd-plan/architect.md */
export function appendProjectArchitect(root: string, content: string): void {
  const dir = join(root, PLAN_DIR)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, "architect.md")
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : ""
  writeFileSync(path, existing + "\n" + content, "utf-8")
}

/** List tasks that are not in status "done" */
export function listPendingTasks(root: string): TaskState[] {
  const slugs = listTasks(root)
  return slugs
    .map(slug => readTaskState(root, slug))
    .filter((state): state is TaskState => state !== null && state.status !== "done")
}

/** Mark a task as done, with optional abort/qa-skip flags. Clears checkpoint. */
export function markTaskDone(
  root: string,
  slug: string,
  opts: { aborted?: boolean; qaSkipped?: boolean } = {}
): void {
  const state = readTaskState(root, slug)
  if (!state) return

  const updated: TaskState = {
    ...state,
    status: "done",
    stage: "done",
    lastUpdatedAt: new Date().toISOString(),
  }

  writeTaskState(root, updated)

  const checkpointPath = join(root, PLAN_DIR, slug, ".checkpoint")
  if (existsSync(checkpointPath)) {
    unlinkSync(checkpointPath)
  }
}

/** Return a human-readable one-line summary of task state. */
export function getTaskSummary(root: string, slug: string): string {
  const state = readTaskState(root, slug)
  if (!state) return `Task ${slug}: not found`
  return `${state.topic} (${state.status}, step ${state.stepsComplete}/${state.stepsTotal})`
}
