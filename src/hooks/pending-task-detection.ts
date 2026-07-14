/**
 * Pending Task Detection — Phase 5 stub.
 *
 * NOT IMPLEMENTED IN PHASE 1.
 *
 * Phase 5 will detect and resume abandoned tasks at session start:
 * - Scan .fd-plan/ for tasks in non-terminal states
 * - Surface the most recent pending task to the user
 * - Offer to resume instead of starting fresh
 *
 * Currently (Phase 1) this is handled by listPendingTasks() in src/state/plan.ts
 * which session.ts calls directly. Phase 5 will expand this into a richer
 * detection and recovery flow.
 *
 * TODO (Phase 5): Implement rich pending task detection.
 *   - Rank pending tasks by lastUpdatedAt
 *   - Surface task history and step progress
 *   - Provide recovery options (resume, abort, archive)
 *   - Detect duplicate/overlapping tasks
 *
 * @see PHASE1_CLEANUP_REPORT.md §Phase-5-Deferrals
 */

import type { TaskState } from "../types"

/**
 * Result of pending task detection.
 */
export interface PendingTaskDetection {
  /** All tasks that are not in "done" status. */
  pendingTasks: TaskState[]
  /** The most recently updated pending task. */
  mostRecent?: TaskState
  /** True when the user has been prompted about resuming. */
  userPrompted: boolean
}

/**
 * Detect pending tasks at session start.
 *
 * Phase 5 will expand this to:
 * - Rank tasks by recency and priority
 * - Group related tasks
 * - Generate a recovery summary for the user
 *
 * @param directory  Project root for .fd-plan/ lookup
 */
export async function detectPendingTasks(
  directory: string
): Promise<PendingTaskDetection> {
  // Phase 5: implement rich detection
  // For now, delegate to the existing Phase 1 implementation
  const { listPendingTasks } = await import("../state/plan")
  const tasks = listPendingTasks(directory)
  return {
    pendingTasks: tasks,
    mostRecent: tasks.length > 0 ? tasks[0] : undefined,
    userPrompted: false,
  }
}
