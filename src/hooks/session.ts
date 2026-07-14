import { listPendingTasks } from "../state/plan"

export async function onSessionStart(opts: { directory: string }): Promise<void> {
  // Session lifecycle hook — minimal v1 implementation
  // Phase 2+ will add:
  // - Check fdx availability
  // - Load prior checkpoint if exists
  // - Initialize task state if new
  const pendingTasks = listPendingTasks(opts.directory)

  if (pendingTasks.length > 0) {
    const task = pendingTasks[0]
    console.log(
      `[FlowDeck] Pending task found: "${task.topic}" — status: ${task.status}, step ${task.stepsComplete}/${task.stepsTotal}.\n` +
        `Type "resume" to continue or ignore to start fresh.`
    )
  } else {
    console.log(`[FlowDeck] Session started in ${opts.directory}`)
  }
}

export async function onSessionEnd(opts: { directory: string }): Promise<void> {
  // Session cleanup hook — minimal v1 implementation
  // Phase 2+ will add:
  // - Save checkpoint before exit
  // - Clean up temp files
  console.log(`[FlowDeck] Session ended in ${opts.directory}`)
}
