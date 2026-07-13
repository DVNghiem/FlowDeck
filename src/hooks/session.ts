export async function onSessionStart(opts: { directory: string }): Promise<void> {
  // Session lifecycle hook — minimal v1 implementation
  // Phase 2+ will add:
  // - Check fdx availability
  // - Load prior checkpoint if exists
  // - Initialize task state if new
  console.log(`[FlowDeck] Session started in ${opts.directory}`)
}

export async function onSessionEnd(opts: { directory: string }): Promise<void> {
  // Session cleanup hook — minimal v1 implementation
  // Phase 2+ will add:
  // - Save checkpoint before exit
  // - Clean up temp files
  console.log(`[FlowDeck] Session ended in ${opts.directory}`)
}
