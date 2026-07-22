---
description: Reload checkpoint.json (falling back to STATE.md) + last PLAN.md + DISCUSS.md — brief the user, PAUSE for confirmation, then continue from where stopped
argument-hint: [--yes]
---

# Resume

Resume a previously interrupted FlowDeck session.

**Input:** $ARGUMENTS (pass `--yes` to skip confirmation pause)

## Steps

1. **Check `~/.fd-plan/<slug>/ultrawork/STATE.md` first.**
   - If it exists and status is not `done`: resume `/fd-ultrawork` from the recorded phase.
   - Read `iteration`, `status`, `plan_file` to determine where to continue.

2. **Otherwise read `~/.fd-plan/<slug>/checkpoint.json` — this is the primary source.**
   - If present and `version` is `"1"`: use it to rebuild the session summary.
     Take `current_phase`, `current_stage`, `current_command`, `workflow_class`,
     `phases`, `worktrees`, and `blockers` from it.
   - If absent, unreadable, or a `version` this command does not understand:
     fall back to `~/.fd-plan/<slug>/STATE.md` and log which source was used.
   - If `~/.fd-plan/<slug>/STATE.md` is also missing, error: "No active workspace. Run
     `/fd-map-codebase` to initialize, then `/fd-new-feature` to start a feature."

3. Read STATE.md to fill in anything `checkpoint.json` does not carry:
   - `last_updated`, `plan_confirmed`, `steps_complete`

4. Read `~/.fd-plan/<slug>/phases/phase-<N>/PLAN.md` if it exists — show preview (first 20 lines).

5. Read `~/.fd-plan/<slug>/phases/phase-<N>/DISCUSS.md` if it exists — show decision count.

6. Present session summary:

```
═══════════════════════════════════════════════
RESUMING SESSION
═══════════════════════════════════════════════
Source: checkpoint.json | STATE.md (fallback)
Phase: <N>  |  Status: <status>
Command: <current_command> → stage: <current_stage>
Workflow: <workflow_class>
Phases: 1 complete, 2 in_progress, 3 pending
Last updated: <timestamp>
Plan confirmed: <yes/no>
Decisions: <X> from DISCUSS.md
Worktrees: <names, or "none">
Blockers: <list, or "none">

Plan preview:
<first 10 lines of PLAN.md>
───────────────────────────────────────────────
Type CONFIRM to resume execution from this point.
═══════════════════════════════════════════════
```

7. Unless `--yes` is passed, **PAUSE** and wait for user to type CONFIRM.

8. After confirmation, resume from `current_command` at `current_stage`:
   - Re-enter `current_command` and skip forward to `current_stage` — do not replay
     stages already recorded complete in `phases`.
   - If `blockers` is non-empty, report them and stop. Do not resume into a blocked state.
   - If `worktrees` is non-empty, list them and confirm whether to reuse or recreate
     before continuing.
   - If `checkpoint.json` was absent: fall back to the STATE.md path — if
     `plan_confirmed: true` and PLAN.md has uncompleted steps, proceed with
     implementation; if no plan, suggest `/fd-plan`.
   - Brief the user on what the next step is before starting
