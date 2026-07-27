# /fd-checkpoint

**Purpose:** Force-save the current session to `checkpoint.json` and `STATE.md` so it can be safely resumed later with `/fd-resume`. Normally runs automatically on `session.idle` via the session-events hook; invoke manually to force a save before closing a session.

## Usage

/fd-checkpoint

## What Happens

1. **Check `~/.fd-plan/<slug>/STATE.md` exists.** If not, error: `"No planning workspace. Run /fd-task to start."`
2. **Read the current STATE.md** and the existing `~/.fd-plan/<slug>/checkpoint.json` if present.
3. **Update STATE.md:**
   - Set `last_updated` to the current timestamp
   - Ensure `status` reflects current state accurately
4. **If `~/.fd-plan/<slug>/<topic>/plan.md` exists**, scan it for completed steps and update `steps_complete` in STATE.md.
5. **Write `~/.fd-plan/<slug>/checkpoint.json`.** This is the file `/fd-resume` reads first. **Merge into the existing file** — never drop fields written by an earlier command.

```json
{
  "version": "1",
  "project": "<slug>",
  "topic": "<topic>",
  "saved_at": "<ISO>",
  "current_command": "fd-execute",
  "current_stage": "wave-2",
  "phases": { "1": "complete", "2": "in_progress", "3": "pending" },
  "files_written": ["~/.fd-plan/<slug>/<topic>/plan.md"],
  "worktrees": [],
  "blockers": [],
  "status": "in_progress"
}
```

**Field rules:**
- `version` — always `"1"`. Bump only when the schema changes incompatibly.
- `project` — the project slug (the directory name used for `~/.fd-plan/<slug>/`).
- `topic` — the active topic slug, i.e. the subdirectory holding the artifacts.
- `saved_at` — ISO 8601 timestamp of this save.
- `current_command` — the `/fd-*` command in flight, e.g. `fd-execute`.
- `current_stage` — the stage within that command, e.g. `complete`, `wave-2`, `failed`.
- `phases` — every known wave number mapped to `complete` | `in_progress` | `pending`.
- `files_written` — planning artifacts written this session, as `~`-prefixed paths.
- `worktrees` — worktrees still live and unmerged, e.g. `fd-<slug>-phase-2`. Empty when none.
- `blockers` — STATE.md blockers, verbatim. Empty when unblocked.
- `status` — `in_progress` while the pipeline is running, `done` after `/fd-done`.

If `checkpoint.json` cannot be written, report the failure rather than claiming a checkpoint that `/fd-resume` cannot load.

6. **Report:**

```
✅ Checkpoint saved
   Topic: <topic> | Command: <current_command> → <current_stage>
   File:  ~/.fd-plan/<slug>/checkpoint.json
   Safe to close session. Resume with /fd-resume.
```

## Examples

```
/fd-checkpoint
```

Save a checkpoint for the current session. Safe to close afterward.

## Related Commands

- `/fd-resume` — restore from `checkpoint.json` (falling back to `STATE.md`) and continue the session
