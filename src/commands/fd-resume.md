---
description: Reload STATE.md + last PLAN.md + DISCUSS.md — brief the user, PAUSE for confirmation, then continue from where stopped
argument-hint: [--yes]
---

# Resume

Resume a previously interrupted FlowDeck session.

**Input:** $ARGUMENTS (pass `--yes` to skip confirmation pause)

## Steps

1. **Check `.planning/ultrawork/STATE.md` first.**
   - If it exists and status is not `done`: resume `/fd-ultrawork` from the recorded phase.
   - Read `iteration`, `status`, `plan_file` to determine where to continue.

2. **Otherwise fall through to standard `.planning/STATE.md` resume logic:**
   - Check `.planning/STATE.md` exists — if not, error: "No active workspace. Run `/fd-init-deep` to initialize, then `/fd-new-feature` to start a feature."

3. Read STATE.md and parse current state:
   - Phase, status, last_updated, plan_confirmed

4. Read `.planning/phases/phase-<N>/PLAN.md` if it exists — show preview (first 20 lines).

5. Read `.planning/phases/phase-<N>/DISCUSS.md` if it exists — show decision count.

6. Present session summary:

```
═══════════════════════════════════════════════
RESUMING SESSION
═══════════════════════════════════════════════
Phase: <N>  |  Status: <status>
Last updated: <timestamp>
Plan confirmed: <yes/no>
Decisions: <X> from DISCUSS.md

Plan preview:
<first 10 lines of PLAN.md>
───────────────────────────────────────────────
Type CONFIRM to resume execution from this point.
═══════════════════════════════════════════════
```

7. Unless `--yes` is passed, **PAUSE** and wait for user to type CONFIRM.

8. After confirmation, continue execution:
   - If `plan_confirmed: true` and there are uncompleted steps in PLAN.md → proceed with implementation
   - If no plan → suggest running `/fd-plan`
   - Brief the user on what the next step is before starting
