---
description: Restore from checkpoint.json (falling back to STATE.md) — brief the user, PAUSE for confirmation, then continue from the recorded command and stage
argument-hint: [--yes]
---

# Resume

Resume a previously interrupted FlowDeck session.

**Input:** $ARGUMENTS — pass `--yes` to skip the confirmation pause.

## Steps

1. **Read `~/.fd-plan/<slug>/checkpoint.json` — this is the primary source.**
   - If present and `version` is `"1"`: rebuild the session summary from
     `current_command`, `current_stage`, `topic`, `phases`, `worktrees`, and `blockers`.
   - If absent, unreadable, or carrying a `version` this command does not understand:
     fall back to `~/.fd-plan/<slug>/STATE.md` and log which source was used.

2. **If `checkpoint.json` is missing, fall back to `STATE.md`.**
   - Read `topic`, `status`, `plan_confirmed`, `steps_complete`, `last_action`,
     `next_action` to reconstruct where the session stopped.
   - If `STATE.md` is also missing, error: `"No planning workspace. Run /fd-task to start."`

3. Read `STATE.md` to fill in anything `checkpoint.json` does not carry:
   `last_updated`, `plan_confirmed`, `steps_complete`.

4. Read `~/.fd-plan/<slug>/<topic>/plan.md` if it exists — show a preview (first 20 lines).

5. Read `~/.fd-plan/<slug>/<topic>/task.md` if it exists — show the requirement count.

6. Present the session summary:

```
═══════════════════════════════════════════════
RESUMING SESSION
═══════════════════════════════════════════════
Source: checkpoint.json | STATE.md (fallback)
Project: <slug>  |  Topic: <topic>
Command: <current_command> → stage: <current_stage>
Status: <status>
Phases: 1 complete, 2 in_progress, 3 pending
Last updated: <timestamp>
Plan confirmed: <yes/no>
Requirements: <X> from task.md
Worktrees: <names, or "none">
Blockers: <list, or "none">

Plan preview:
<first 10 lines of plan.md>
───────────────────────────────────────────────
Type CONFIRM to resume execution from this point.
═══════════════════════════════════════════════
```

7. Unless `--yes` is passed, **PAUSE** and wait for the user to type CONFIRM.

8. After confirmation, resume from `current_command` at `current_stage`:
   - Re-enter `current_command` and skip forward to `current_stage` — do not replay
     stages already recorded complete in `phases`.
   - If `blockers` is non-empty, report them and stop. Do not resume into a blocked state.
   - If `worktrees` is non-empty, list them and confirm whether to reuse or recreate
     before continuing.
   - If `checkpoint.json` was absent, use the STATE.md path: when `plan_confirmed: true`
     and `plan.md` has uncompleted steps, resume at `/fd-execute`; when no plan exists,
     start at `/fd-task`.
   - Brief the user on the next step before starting it.

## Pipeline reference

Stages resume in this order and may not be skipped:

```
fd-task → fd-review → fd-execute → fd-verify → fd-done
```

## Examples

```
/fd-resume
```

Show session summary and wait for CONFIRM before resuming.

```
/fd-resume --yes
```

Skip confirmation and immediately resume from the last checkpoint.

## Related Commands

- `/fd-checkpoint` — save a checkpoint before closing a session
- `/fd-execute` — continue implementation (auto-triggered after CONFIRM)
