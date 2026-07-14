/**
 * FlowDeck v1 state types.
 * Phase 1 Foundation — see PHASE1_CLEANUP_REPORT.md for architecture overview.
 */

import type { TaskState, CheckpointState } from "../types"

// ── FdPlanState ──────────────────────────────────────────────────────────────

/** Phase status tracked per task under .fd-plan/. */
export type PhaseStatus = "planned" | "discussing" | "executing" | "verified" | "complete"

/**
 * Aggregated plan state for a task.
 * Stored at `.fd-plan/<slug>/.state.json` and mirrored into FdPlanState
 * for command/agent consumption.
 */
export interface FdPlanState {
  /** Current workflow phase (1-based). */
  phase: number
  /** Phase-level status. */
  status: PhaseStatus
  /** True once the plan has been confirmed by the user. */
  planConfirmed: boolean
  /** Active blockers preventing progress. */
  blockers: string[]
  /** Step titles that have been completed. */
  stepsComplete: string[]
  /** True when a design stage must complete before coding begins. */
  requiresDesignFirst: boolean
  /** Current design stage label, if design is active. */
  designStage?: string
  /** True once the design has been user-approved. */
  designApproved?: boolean
  /** ISO-8601 timestamp of last state change. */
  lastUpdated: string
  // Phase 2 fields (present in TaskState but not written by Phase 1)
  topic?: string
  slug?: string
  date?: string
  hasUI?: boolean
  needsArchitect?: boolean
  qaSkipped?: boolean
  aborted?: boolean
}

// ── CodebaseState ────────────────────────────────────────────────────────────

/** Project-level codebase metadata. Stored at `.fd-plan/.codebase.json`. */
export interface CodebaseState {
  /** Absolute path to the project root. */
  projectRoot: string
  /** Detected programming languages (e.g. ["typescript", "python"]). */
  languages: string[]
  /** Relative path to the architect.md file, if it exists. */
  archFile?: string
  /** ISO-8601 timestamp of last index update. */
  indexedAt: string
  /** Detected frameworks (e.g. ["react", "fastapi"]). */
  frameworks?: string[]
  /** Relative path to the CLAUDE.md project instructions file. */
  claudeMdPath?: string
}

// ── TDD state (Phase 3 — carried forward in PlanningState) ────────────────

/**
 * TDD workflow state embedded in PlanningState.
 * TDD enforcement is Phase 3 responsibility — coder agents will use this.
 */
export type TddPhase = "red" | "green" | "refactor" | "idle"

export interface TddState {
  active: boolean
  currentPhase: TddPhase
  failingTestFile?: string
  lastFailingTest?: string
}

// ── Routing types ────────────────────────────────────────────────────────────

/**
 * Routing hints used by the orchestrator to select agents.
 * Populated by classifyDispatch() in session-start.ts.
 */
export interface RoutingScores {
  explore: number
  research: number
  architect: number
  plan: number
  execute: number
  qa: number
  ship: number
}

/** Classification of the current user intent. */
export type IntentClass = "explore" | "bugfix" | "ui-heavy" | "docs-only" | "trivial" | "unknown"

// ── Design stage types ───────────────────────────────────────────────────────

/** Design workflow stages. */
export type DesignStage =
  | "discovery"
  | "wireframes"
  | "visual-design"
  | "component-spec"
  | "design-review"
  | "approved"
  | "skipped"

// ── PlanningState (Phase 3) ─────────────────────────────────────────────────

/**
 * Phase 3 — TDD state machine embedded in PlanningState.
 * Created in planning-state-lib.ts; not implemented in Phase 1.
 */
export interface PlanningState {
  phase: number
  status: PhaseStatus
  tdd: TddState
  designStage: DesignStage
  blockers: string[]
  stepsComplete: string[]
  planConfirmed: boolean
  requiresDesignFirst: boolean
}
