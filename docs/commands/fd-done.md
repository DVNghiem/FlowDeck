# /fd-done

**Purpose:** Mark a feature or phase complete, validate readiness, finalize state, and refresh the codebase mapping.

## Usage

/fd-done [--skip-verify] [--phase=N]

## Arguments

- `--skip-verify` (optional) — allow closing without a prior `/fd-verify` run
- `--phase=N` (optional) — target a specific phase

## What Happens

### Step 0: Pre-flight

1. Check `.planning/STATE.md` exists. If not: error "No active feature. Run `/fd-map-codebase` then `/fd-new-feature` to start a feature."
2. Read current STATE.md using `planning_state action=read`.
3. Record: `phase`, `status`, `plan_confirmed`, `blockers`, `steps_complete`, `requires_design_first`, `design_stage`, `design_approved`.

### Step 1: Completion Readiness Validation

Before marking done, verify the workflow is in a finishable state.

| Check | Pass condition |
|-------|---------------|
| Plan confirmed | `plan_confirmed: true` |
| Not already done | `status != "complete"` |
| Work has started | `status != "planned"` OR `steps_complete` is non-empty |
| No active blockers | `blockers` list is empty or contains only `"none"` |
| Design gate (if required) | `requires_design_first: false` OR `design_stage: handoff_complete` AND `design_approved: true` OR `design_override: true` |

If any check fails, stop and report all failures. Do NOT update any state when validation fails.

**Verify check:**
- If `status != "verified"` and `--skip-verify` was NOT passed: warn that `/fd-verify` has not been run
- If `--skip-verify` is passed: log that verification was skipped

### Step 2: Collect Completion Evidence

Gather files changed in this feature:
```bash
git diff --name-only HEAD
git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "(no commits yet)"
```

Record `changedFiles[]` for the summary artifact.

### Step 3: Codebase Mapping — Refresh or Reuse

Check codegraph state: `codegraph action=status`

- **If mapping is fresh** (indexed, `freshnessStatus: fresh`, no changed files since last index):
  - Log: "[fd-done] Codebase mapping is current — skipping remap"
  - Record: `mappingRefreshed: false`, `mappingFreshnessStatus: fresh`

- **If mapping is stale, absent, or changed files exist since last index:**
  - Log: "[fd-done] Refreshing codebase mapping..."
  - Run: `codegraph action=refresh agent=fd-done`
  - Record result: `mappingRefreshed: true`, `mappingFreshnessStatus: fresh|stale`
  - If refresh fails: log error, set `mappingFreshnessStatus: stale`, continue — do not abort

### Step 4: Mark Feature Complete

Update STATE.md:
```
planning_state action=update updates={
  status: "complete",
  last_action: "Phase <N> marked done via /fd-done",
  next_action: "Run /fd-status to review project state, or /fd-new-feature to start the next phase"
}
```

Additional fields to upsert:
```
completed_at: "<ISO timestamp>"
completed_by: "fd-done"
verify_skipped: <true|false>
mapping_refreshed_at_done: "<ISO timestamp if refreshed, else skipped>"
mapping_freshness_at_done: "<fresh|stale|skipped>"
```

### Step 5: Write Completion Artifact

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

### Step 6: Update ROADMAP.md (if present)

If `.planning/ROADMAP.md` exists:
- Find the entry for Phase N
- Update its status to `completed`
- Preserve all other phases unchanged

### Step 7: Report Completion

Print final summary with completion timestamp, prior status, steps complete, changed files count, verification status, and mapping freshness.

## Error Handling

- STATE.md not found → error with remediation ("No active feature. Run `/fd-map-codebase` then `/fd-new-feature` to start a feature.")
- Completion validation fails → list all failures, do not update state
- Mapping refresh fails → log error, continue with `mappingFreshnessStatus: stale`
- DONE.md write fails → log error, do not fail overall — state is already updated
- ROADMAP.md update fails → log error, do not fail overall

No partial state writes. Either the validation passes and full state is written, or nothing is written.

## Output / State

- `.planning/STATE.md` — status set to `complete`
- `.planning/phases/phase-<N>/DONE.md` — completion artifact written
- `.planning/ROADMAP.md` — phase marked as completed (if exists)
- Codebase mapping refreshed (if needed)

### DONE.md Artifact Format

The completion artifact at `.planning/phases/phase-<N>/DONE.md` uses this structure:

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

## Examples

**Mark current phase complete:**
```
/fd-done
```

**Mark specific phase complete:**
```
/fd-done --phase=2
```

**Close without prior verification:**
```
/fd-done --skip-verify
```

## Related Commands

- `/fd-status` — review the completed project state
- `/fd-new-feature` — start the next feature
- `/fd-deploy-check` — pre-deployment checks after completing a phase
- `/fd-verify` — full verification before marking done (recommended)