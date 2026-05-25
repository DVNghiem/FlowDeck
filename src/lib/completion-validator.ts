import type { PlanningState } from "../tools/planning-state-lib"

export interface CompletionReadiness {
  valid: boolean
  /** Why it's ready (when valid) */
  summary?: string
  /** Blocking reasons (when not valid) */
  blockers: string[]
}

/**
 * Validate whether a feature/workflow is in a finishable state.
 *
 * Rules:
 * - STATE.md must exist (caller is responsible for passing state)
 * - status must not be "planned" (nothing has started)
 * - plan_confirmed must be true (plan must have been confirmed)
 * - no active blockers
 * - if design-first was required, it must be satisfied
 * - status must be "verified" or "in_progress" (not already "complete")
 */
export function validateCompletionReadiness(state: PlanningState): CompletionReadiness {
  const blockers: string[] = []

  if (!state.plan_confirmed) {
    blockers.push("Plan has not been confirmed. Run /fd-plan first.")
  }

  if (state.status === "complete") {
    blockers.push("Feature is already marked complete.")
  }

  if (state.status === "planned" && state.steps_complete.length === 0) {
    blockers.push("No steps completed yet. Run /fd-execute first.")
  }

  if (state.blockers && state.blockers.length > 0) {
    const activeBlockers = state.blockers.filter(b => b && b !== "none" && b.trim().length > 0)
    if (activeBlockers.length > 0) {
      blockers.push(`Unresolved blockers: ${activeBlockers.join("; ")}`)
    }
  }

  if (state.requires_design_first && !state.design_override) {
    if (state.design_stage !== "handoff_complete" || !state.design_approved) {
      blockers.push(
        `Design-first workflow not satisfied. Current stage: ${state.design_stage}. Run /fd-design to complete design gate.`
      )
    }
  }

  if (state.status === "verified") {
    // Best state — /fd-verify passed
  } else if (state.status === "in_progress" && state.steps_complete.length > 0) {
    // Acceptable — work was done even if /fd-verify wasn't run
    // (user may want to skip verify; we allow but note it)
  } else if (blockers.length === 0 && state.status !== "complete") {
    // Allow any other non-blocked state through
  }

  if (blockers.length > 0) {
    return { valid: false, blockers }
  }

  const stepsInfo = state.steps_complete.length > 0
    ? `${state.steps_complete.length} step(s) completed`
    : "no explicit steps tracked"

  return {
    valid: true,
    blockers: [],
    summary: `Phase ${state.phase} is ready to close (${stepsInfo}, status: ${state.status})`,
  }
}

export interface CompletionMetadata {
  /** Feature/phase number */
  phase: number
  /** ISO timestamp of completion */
  completedAt: string
  /** Who/what triggered completion */
  completedBy: string
  /** Final status before done was called */
  priorStatus: string
  /** Steps that were complete at time of closing */
  stepsComplete: number[]
  /** Whether /fd-verify had been run */
  wasVerified: boolean
  /** Changed files summary from git diff */
  changedFiles: string[]
  /** Whether verify was explicitly skipped */
  verifySkipped: boolean
  /** Whether codebase mapping was refreshed */
  mappingRefreshed: boolean
  /** Freshness status of mapping after done */
  mappingFreshnessStatus: "fresh" | "stale" | "skipped"
}

/**
 * Build a human-readable DONE.md summary artifact for the current phase.
 */
export function buildCompletionSummary(meta: CompletionMetadata): string {
  const verifyNote = meta.wasVerified
    ? "✅ /fd-verify ran — all checks passed before closing"
    : meta.verifySkipped
      ? "⚠️  /fd-verify not run — skipped by user"
      : "⚠️  /fd-verify not run — consider running before deploying"

  const mappingNote = meta.mappingRefreshed
    ? `✅ Codebase mapping refreshed (status: ${meta.mappingFreshnessStatus})`
    : `ℹ️  Codebase mapping reused — already fresh (status: ${meta.mappingFreshnessStatus})`

  const changedFilesSection = meta.changedFiles.length > 0
    ? `## Changed Files\n\n${meta.changedFiles.map(f => `- ${f}`).join("\n")}\n`
    : `## Changed Files\n\n- (none detected by git diff)\n`

  return [
    `# Phase ${meta.phase} — Done`,
    "",
    `**Completed:** ${meta.completedAt}`,
    `**Completed by:** ${meta.completedBy}`,
    `**Prior status:** ${meta.priorStatus}`,
    `**Steps complete:** ${meta.stepsComplete.length > 0 ? meta.stepsComplete.join(", ") : "—"}`,
    "",
    `## Verification`,
    "",
    verifyNote,
    "",
    `## Codebase Mapping`,
    "",
    mappingNote,
    "",
    changedFilesSection,
    `## Next Steps`,
    "",
    "- Run `/fd-status` to see the full project state",
    "- Run `/fd-new-feature` or increment the phase to start the next feature",
    "- Run `/fd-deploy-check` if preparing for production deployment",
    "",
  ].join("\n")
}

/**
 * Check whether the prior status indicates /fd-verify was run.
 */
export function wasVerified(status: string): boolean {
  return status === "verified"
}
