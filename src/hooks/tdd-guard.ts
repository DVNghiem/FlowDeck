/**
 * TDD Guard — Phase 3 stub.
 *
 * NOT IMPLEMENTED IN PHASE 1.
 *
 * Phase 3 (coder agents) will enforce a test-first workflow:
 * 1. RED    — write a failing test
 * 2. GREEN  — write minimal production code to pass
 * 3. REFACTOR — improve without changing behavior
 *
 * The orchestrator guard (src/hooks/guard.ts) will call checkTddGuard()
 * once this module is implemented.
 *
 * TODO (Phase 3): Implement TDD enforcement for coder agents.
 *   - Track which files have been written per step
 *   - Block production code writes until a corresponding test exists
 *   - Exempt config files, docs, and migrations
 *   - Wire into checkOrchestratorTool() in guard.ts
 *
 * @see PHASE1_CLEANUP_REPORT.md §Phase-3-Deferrals
 */

// Placeholder — replace with actual implementation in Phase 3
export function checkTddGuard(
  stepId: string,
  filePath: string,
  isCoderAgent: boolean
): { allowed: boolean; reason?: string } {
  // Phase 3: implement TDD state machine
  return { allowed: true }
}

export function clearStepWrites(_stepId: string): void {
  // Phase 3: clear write tracker for step
}

export function recordStepWrite(_stepId: string, _filePath: string): void {
  // Phase 3: record file write for step
}
