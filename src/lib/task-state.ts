/**
 * Async task state I/O with atomic writes.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { readTaskState as syncRead, writeTaskState as syncWrite } from "../state/plan.js"
import type { TaskState, CheckpointState, WorkflowStage, TaskStatus } from "../types.js"

const PLAN_DIR = ".fd-plan"

// ── Path helpers ─────────────────────────────────────────────────────────────

/** .fd-plan/<slug>/ */
export function taskDir(root: string, slug: string): string {
  return join(root, PLAN_DIR, slug)
}

/** .fd-plan/<slug>/.state.json */
export function stateFilePath(root: string, slug: string): string {
  return join(taskDir(root, slug), ".state.json")
}

/** .fd-plan/<slug>/.checkpoint */
export function checkpointFilePath(root: string, slug: string): string {
  return join(taskDir(root, slug), ".checkpoint")
}

// ── Atomic write ───────────────────────────────────────────────────────────────

/** Write content atomically: temp file + rename. Survives interruption. */
function atomicWrite(path: string, content: string): void {
  const dir = join(path, "..")
  mkdirSync(dir, { recursive: true })
  const tmp = `${path}.tmp.${Date.now()}`
  writeFileSync(tmp, content, "utf-8")
  renameSync(tmp, path)
}

// ── Task state I/O ────────────────────────────────────────────────────────────

/**
 * Create initial task state.
 * Creates .fd-plan/<slug>/ directory + writes .state.json.
 */
export async function initializeTaskState(
  root: string,
  slug: string,
  topic: string,
  hasUI: boolean,
  needsArchitect: boolean
): Promise<TaskState> {
  const now = new Date().toISOString()
  const today = now.slice(0, 10) // YYYY-MM-DD

  const state: TaskState = {
    topic,
    slug,
    date: today,
    status: "exploring",
    stage: "explore",
    hasUI,
    needsArchitect,
    planConfirmed: false,
    stepsTotal: 0,
    stepsComplete: 0,
    lastUpdatedAt: now,
  }

  const path = stateFilePath(root, slug)
  mkdirSync(join(path, ".."), { recursive: true })
  atomicWrite(path, JSON.stringify(state, null, 2))
  return state
}

/** Read task state — returns null if not found. Uses sync (fast enough for init). */
export async function readTaskState(
  root: string,
  slug: string
): Promise<TaskState | null> {
  return syncRead(root, slug)
}

/** Write task state atomically. */
export async function writeTaskState(
  root: string,
  state: TaskState
): Promise<void> {
  const path = stateFilePath(root, state.slug)
  const updated: TaskState = { ...state, lastUpdatedAt: new Date().toISOString() }
  atomicWrite(path, JSON.stringify(updated, null, 2))
}

/** Update just the stage field. */
export async function updateTaskStage(
  root: string,
  slug: string,
  stage: WorkflowStage
): Promise<void> {
  const state = await readTaskState(root, slug)
  if (!state) return
  await writeTaskState(root, { ...state, stage })
}

/** Update just the status field. */
export async function updateTaskStatus(
  root: string,
  slug: string,
  status: TaskStatus
): Promise<void> {
  const state = await readTaskState(root, slug)
  if (!state) return
  await writeTaskState(root, { ...state, status })
}

// ── Checkpoint I/O ───────────────────────────────────────────────────────────

/** Save checkpoint atomically. */
export async function saveCheckpoint(
  root: string,
  slug: string,
  checkpoint: CheckpointState
): Promise<void> {
  const path = checkpointFilePath(root, slug)
  const dir = join(path, "..")
  mkdirSync(dir, { recursive: true })
  atomicWrite(path, JSON.stringify(checkpoint, null, 2))
}

/** Load checkpoint — returns null if not found. */
export async function loadCheckpoint(
  root: string,
  slug: string
): Promise<CheckpointState | null> {
  const path = checkpointFilePath(root, slug)
  if (!existsSync(path)) return null
  try {
    const content = readFileSync(path, "utf-8")
    return JSON.parse(content) as CheckpointState
  } catch {
    return null
  }
}

// ── List tasks ────────────────────────────────────────────────────────────────

/** List all task states under .fd-plan/. */
export async function listTasks(root: string): Promise<TaskState[]> {
  const planPath = join(root, PLAN_DIR)
  if (!existsSync(planPath)) return []
  const { readdirSync } = await import("fs")
  const dirs = readdirSync(planPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  return dirs
    .map(slug => syncRead(root, slug))
    .filter((s): s is TaskState => s !== null)
}

/** List pending tasks (status != "done"). */
export async function listPendingTasks(root: string): Promise<TaskState[]> {
  const all = await listTasks(root)
  return all.filter(s => s.status !== "done")
}

// ── Slug generation ───────────────────────────────────────────────────────────

/**
 * Convert topic string to kebab-case slug with a 4-char content hash suffix
 * to make collisions detectable: "Add user authentication" and
 * "Add User Authentication" produce distinct slugs because the hash differs.
 *
 * The hash is taken from the *original* topic string, not the slugified form,
 * so casing and whitespace differences propagate through the suffix.
 */
export function slugify(topic: string): string {
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const hash = hash4(topic)
  return base ? `${base}-${hash}` : hash
}

/**
 * 4-char lowercase hex hash of the input. Stable across runs (not security —
 * collisions are fine; we just need distinct slugs for distinct topics).
 */
function hash4(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 4)
}
