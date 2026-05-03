---
description: Reload STATE.md + last PLAN.md + DISCUSS.md — brief the user, PAUSE for confirmation, then continue from where stopped
argument-hint: [--yes]
---

# Resume

Resume a previously interrupted FlowDeck session.

**Input:** $ARGUMENTS (pass `--yes` to skip confirmation pause)

## Steps

1. Check `.planning/STATE.md` exists — if not, error: "No active project. Run /fd-new-project first."

2. Read STATE.md and parse current state:
   - Phase, status, last_updated, plan_confirmed

3. Read `.planning/phases/phase-<N>/PLAN.md` if it exists — show preview (first 20 lines).

4. Read `.planning/phases/phase-<N>/DISCUSS.md` if it exists — show decision count.

5. Present session summary:

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

6. Unless `--yes` is passed, **PAUSE** and wait for user to type CONFIRM.

7. After confirmation, continue execution:
   - If `plan_confirmed: true` and there are uncompleted steps in PLAN.md → proceed with implementation
   - If no plan → suggest running `/fd-plan`
   - Brief the user on what the next step is before starting
