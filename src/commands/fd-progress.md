---
description: Display project progress — STATE.md summary, active PLAN.md steps, and recent results
argument-hint: [--json]
---

# Progress

Display current project progress from planning files.

**Input:** $ARGUMENTS (pass `--json` for machine-readable output)

## Steps

1. Check `.planning/STATE.md` exists — if not, return error: "Initialize project first with /fd-new-project."

2. Read STATE.md and parse:
   - Current phase number
   - Status (planned/in_progress/completed)
   - Last updated timestamp
   - `plan_confirmed` flag

3. Read `.planning/phases/phase-<N>/PLAN.md` if it exists:
   - Count total steps (lines matching `- [ ]` or `- [x]`)
   - Count completed steps (lines matching `- [x]`)

4. Check for recent RESULT.md files in the last 3 phases.

5. Display:

```
════════════════════════════════════════════════════════════
Phase: <N>  |  Status: <status>  |  Updated: <timestamp>
────────────────────────────────────────────────────────────
Plan: <X> steps (<Y> complete)
Plan confirmed: <yes/no>
Recent results: Phase <N-1>, Phase <N>
════════════════════════════════════════════════════════════
```

If `--json`, output structured JSON instead:
```json
{
  "phase": N,
  "status": "...",
  "plan_confirmed": true,
  "steps_total": X,
  "steps_complete": Y,
  "last_updated": "..."
}
```
