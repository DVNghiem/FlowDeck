/**
 * Planning state helpers for .fd-plan/ file operations.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { TaskState, TaskStatus, WorkflowStage } from "../types"
import type { FdPlanState, PhaseStatus } from "../types/state"
import {
  readTaskState as _readTaskState,
  writeTaskState as _writeTaskState,
} from "../state/plan"

const PLAN_DIR = ".fd-plan"

const FDPLAN_STATE_VERSION = 1

// ── FdPlanState read/write ──────────────────────────────────────────────────

/**
 * Read FdPlanState for a task.
 * Returns null if the task has no state file.
 */
export function readFdPlanState(root: string, slug: string): FdPlanState | null {
  const state = _readTaskState(root, slug)
  if (!state) return null
  return taskStateToFdPlanState(state)
}

/**
 * Write FdPlanState for a task.
 * Creates .fd-plan/<slug>/ if it doesn't exist.
 */
export function writeFdPlanState(root: string, state: FdPlanState): void {
  const taskState: TaskState = {
    topic: state.topic ?? state.slug ?? "unknown",
    slug: state.slug ?? "unknown",
    date: state.date ?? new Date().toISOString().slice(0, 10),
    status: fdStatusToTaskStatus(state.status) as TaskStatus,
    stage: fdStatusToStage(state.status) as WorkflowStage,
    hasUI: state.hasUI ?? false,
    needsArchitect: state.needsArchitect ?? false,
    planConfirmed: state.planConfirmed,
    stepsTotal: 0,
    stepsComplete: state.stepsComplete.length,
    lastUpdatedAt: state.lastUpdated,
    qaSkipped: state.qaSkipped,
    aborted: state.aborted,
  }
  _writeTaskState(root, taskState)
}

// ── Phase file operations ────────────────────────────────────────────────────

/**
 * Read a phase artifact file.
 * Returns null if the file does not exist.
 */
export function readPhaseFile(
  root: string,
  slug: string,
  date: string,
  fileType: "discuss" | "plan" | "checkpoint" | "review" | "learning" | "architect"
): string | null {
  const filename = `${date}-${slug}-${fileType}.md`
  const path = join(root, PLAN_DIR, slug, filename)
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, "utf-8")
  } catch {
    return null
  }
}

/**
 * Write a phase artifact file.
 * Creates .fd-plan/<slug>/ if needed.
 */
export function writePhaseFile(
  root: string,
  slug: string,
  date: string,
  fileType: "discuss" | "plan" | "checkpoint" | "review" | "learning" | "architect",
  content: string
): void {
  const dir = join(root, PLAN_DIR, slug)
  mkdirSync(dir, { recursive: true })
  const filename = `${date}-${slug}-${fileType}.md`
  const path = join(dir, filename)
  writeFileSync(path, content, "utf-8")
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function taskStateToFdPlanState(state: TaskState): FdPlanState {
  return {
    phase: 1,
    status: taskStatusToFdStatus(state.status),
    planConfirmed: state.planConfirmed,
    blockers: [],
    stepsComplete: [],
    requiresDesignFirst: state.needsArchitect,
    lastUpdated: state.lastUpdatedAt,
    topic: state.topic,
    slug: state.slug,
    date: state.date,
    hasUI: state.hasUI,
    needsArchitect: state.needsArchitect,
    qaSkipped: state.qaSkipped,
    aborted: state.aborted,
  }
}

function taskStatusToFdStatus(status: string): PhaseStatus {
  const map: Record<string, PhaseStatus> = {
    exploring: "planned",
    researching: "planned",
    planning: "planned",
    awaiting_confirm: "planned",
    executing: "executing",
    qa: "verified",
    awaiting_ship: "verified",
    done: "complete",
  }
  return map[status] ?? "planned"
}

function fdStatusToTaskStatus(status: PhaseStatus): string {
  const map: Record<PhaseStatus, string> = {
    planned: "planning",
    discussing: "planning",
    executing: "executing",
    verified: "qa",
    complete: "done",
  }
  return map[status]
}

function fdStatusToStage(status: PhaseStatus): string {
  const map: Record<PhaseStatus, string> = {
    planned: "plan",
    discussing: "plan",
    executing: "execute",
    verified: "qa",
    complete: "done",
  }
  return map[status]
}
