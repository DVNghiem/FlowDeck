---
description: Mark the current feature as complete — validates readiness, finalizes state, refreshes codebase mapping
argument-hint: [--skip-verify] [--phase=N]
---

# Done

Close the current feature or phase: validate completion readiness, mark it done, update all shared state, and refresh the codebase mapping so later commands start from a current understanding of the code.

**Input:** $ARGUMENTS — optional `--skip-verify` to allow closing without a prior `/fd-verify` run; optional `--phase=N` to target a specific phase

## Step 0: Pre-flight

1. Check `.planning/STATE.md` exists. If not: error `"No active feature. Run \`/fd-map-codebase\` then \`/fd-new-feature\` to start a feature."`
2. Read current STATE.md using `planning_state action=read`.
3. Record: `phase`, `status`, `plan_confirmed`, `blockers`, `steps_complete`, `requires_design_first`, `design_stage`, `design_approved`.

## Step 1: Completion Readiness Validation

Before marking done, verify the workflow is in a finishable state.

Evaluate all of the following. Collect every failure — do not stop at the first:

| Check | Pass condition |
|-------|---------------|
| Plan confirmed | `plan_confirmed: true` |
| Not already done | `status != "complete"` |
| Work has started | `status != "planned"` OR `steps_complete` is non-empty |
| No active blockers | `blockers` list is empty or contains only `"none"` |
| Design gate (if required) | `requires_design_first: false` OR `design_stage: handoff_complete` AND `design_approved: true` OR `design_override: true` |

**If any check fails**, stop and report:

```
❌ Cannot mark done — completion requirements not met:

  - [ ] <reason 1>
  - [ ] <reason 2>

Fix these issues, then run /fd-done again.
```

Do NOT update any state when validation fails.

**Verify check:**

If `status != "verified"` and `--skip-verify` was NOT passed:
- Warn: `"⚠️  /fd-verify has not been run for this phase. Run /fd-verify first, or pass --skip-verify to close without it."`
- Do NOT block — this is a warning, not a hard blocker (unless there are other hard blockers above)

If `--skip-verify` is passed:
- Log: `"[fd-done] --skip-verify passed — closing without /fd-verify"`

## Step 2: Collect Completion Evidence

Gather files changed in this feature:

```bash
git diff --name-only HEAD
```

Also check:

```bash
git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "(no commits yet)"
```

Record `changedFiles[]` for the summary artifact.

## Step 3: Codebase Mapping — Refresh or Reuse

Check current codegraph state:

```
codegraph action=status
```

**If mapping is fresh** (indexed, `freshnessStatus: fresh`, and no changed files since last index):
- Log: `"[fd-done] Codebase mapping is current — skipping remap"`
- Record: `mappingRefreshed: false`, `mappingFreshnessStatus: fresh`

**If mapping is stale, absent, or changed files exist since last index:**
- Log: `"[fd-done] Refreshing codebase mapping..."`
- Run:
  ```
  codegraph action=refresh agent=fd-done
  ```
- Record result: `mappingRefreshed: true`, `mappingFreshnessStatus: fresh|stale`
- If refresh fails: log the error, set `mappingFreshnessStatus: stale`, continue — do not abort completion

## Step 4: Mark Feature Complete

Update STATE.md:

```
planning_state action=update updates={
  status: "complete",
  last_action: "Phase <N> marked done via /fd-done",
  next_action: "Run /fd-status to review project state, or /fd-new-feature to start the next phase"
}
```

Additional fields to upsert directly into STATE.md:

```
completed_at: "<ISO timestamp>"
completed_by: "fd-done"
verify_skipped: <true|false>
mapping_refreshed_at_done: "<ISO timestamp if refreshed, else skipped>"
mapping_freshness_at_done: "<fresh|stale|skipped>"
```

## Step 5: Write Completion Artifact

Write `.planning/phases/phase-<N>/DONE.md`:

```markdown
# Phase <N> — Done

**Completed:** <ISO timestamp>
**Completed by:** fd-done
**Prior status:** <status before this run>
**Steps complete:** <list>

## Verification

✅ /fd-verify ran — all checks passed before closing
  — OR —
⚠️  /fd-verify not run — skipped by user (--skip-verify)
  — OR —
⚠️  /fd-verify not run — consider running before deploying

## Codebase Mapping

✅ Codebase mapping refreshed (status: fresh)
  — OR —
ℹ️  Codebase mapping reused — already fresh (status: fresh)
  — OR —
⚠️  Codebase mapping refresh failed (status: stale)

## Changed Files

- <file 1>
- <file 2>
...

## Next Steps

- Run `/fd-status` to see the full project state
- Run `/fd-new-feature` or increment the phase to start the next feature
- Run `/fd-deploy-check` if preparing for production deployment
```

## Step 6: Update ROADMAP.md (if present)

If `.planning/ROADMAP.md` exists:
- Find the entry for Phase N
- Update its status from whatever it currently is to `completed`
- Preserve all other phases unchanged

Only do this if the ROADMAP.md already tracks phases explicitly.

## Step 7: Report Completion

Print final summary:

```
════════════════════════════════════════════════════════════
✅ DONE  — Phase <N> marked complete
════════════════════════════════════════════════════════════

  Completed at:      <timestamp>
  Prior status:      <status>
  Steps complete:    <N>
  Changed files:     <N files>

  Verification:      ✅ verified  |  ⚠️ skipped
  Codebase mapping:  ✅ refreshed  |  ℹ️ reused (already fresh)

  Artifact:          .planning/phases/phase-<N>/DONE.md
  State:             .planning/STATE.md  ← status: complete

────────────────────────────────────────────────────────────
Next: /fd-status  |  /fd-new-feature  |  /fd-deploy-check
════════════════════════════════════════════════════════════
```

## Error Handling

- STATE.md not found → error with remediation ("No active feature. Run `/fd-map-codebase` then `/fd-new-feature` to start a feature.")
- Completion validation fails → list all failures, do not update state
- Mapping refresh fails → log error, continue with `mappingFreshnessStatus: stale`
- DONE.md write fails → log error, do not fail overall — state is already updated
- ROADMAP.md update fails → log error, do not fail overall

No partial state writes. Either the validation passes and full state is written, or nothing is written.
