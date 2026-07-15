/**
 *
 * NOT IMPLEMENTED IN PHASE 1.
 *
 * - Scan .fd-plan/ for tasks in non-terminal states
 * - Surface the most recent pending task to the user
 * - Offer to resume instead of starting fresh
 *
 * detection and recovery flow.
 *
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
 * Reads tasks via `listPendingTasks`, sorts them by `lastUpdatedAt`
 * descending (most recent first), and surfaces the freshest one as
 * `mostRecent` for the orchestrator's recovery prompt.
 *
 * @param directory  Project root for .fd-plan/ lookup
 */
export async function detectPendingTasks(
  directory: string
): Promise<PendingTaskDetection> {
  const { listPendingTasks } = await import("../state/plan")
  const tasks = listPendingTasks(directory).slice().sort((a, b) => {
    return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)
  })
  return {
    pendingTasks: tasks,
    mostRecent: tasks.length > 0 ? tasks[0] : undefined,
    userPrompted: false,
  }
}
