---
description: Force-save current state to STATE.md, CHECKPOINT.md, and checkpoint.json — safe to close session
---

# Checkpoint

Save the current session state so work can be safely resumed later.

## Steps

1. Check `~/.fd-plan/<slug>/STATE.md` exists — if not, error: "No active workspace. Run `/fd-map-codebase` to initialize, then `/fd-new-feature` to start a feature."

2. Read current STATE.md content.

3. Update STATE.md:
   - Set `last_updated` to current timestamp
   - Ensure `status` reflects current state accurately

4. If `~/.fd-plan/<slug>/phases/phase-<N>/PLAN.md` exists, scan for completed steps and update STATE.md's `steps_complete` if tracked.

5. Write a brief checkpoint summary to `~/.fd-plan/<slug>/phases/phase-<N>/CHECKPOINT.md`:

```markdown
# Checkpoint

**Saved:** <timestamp>
**Phase:** <N>
**Status:** <status>
**Plan confirmed:** <yes/no>

## What was done

<brief summary of recent changes in this session>

## What's next

<next uncompleted step from PLAN.md, or "No plan active">
```

6. Write the machine-readable checkpoint to `~/.fd-plan/<slug>/checkpoint.json`.
   This is the file `/fd-resume` reads first — CHECKPOINT.md above is the human-readable
   companion, not the source of truth.

```json
{
  "version": "1",
  "project": "<slug>",
  "saved_at": "<ISO>",
  "current_command": "fd-execute",
  "current_phase": 2,
  "current_stage": "implement",
  "workflow_class": "standard",
  "phases": { "1": "complete", "2": "in_progress", "3": "pending" },
  "files_written": ["~/.fd-plan/<slug>/phases/phase-1/PLAN.md"],
  "worktrees": [],
  "blockers": []
}
```

Field rules:
- `version` — always `"1"`. Bump only when the schema changes incompatibly.
- `project` — the project slug (the directory name used for `~/.fd-plan/<slug>/`).
- `saved_at` — ISO 8601 timestamp, same value as CHECKPOINT.md's **Saved**.
- `current_command` — the `/fd-*` command that was in flight, e.g. `fd-execute`.
- `current_phase` — integer phase number from STATE.md.
- `current_stage` — the stage within that command, e.g. `plan`, `implement`, `verify`.
- `workflow_class` — the class recorded in STATE.md (`trivial`, `standard`, `explore`, …).
- `phases` — every known phase number mapped to `complete` | `in_progress` | `pending`.
- `files_written` — planning artifacts written this session, as absolute or `~`-prefixed paths.
- `worktrees` — names of worktrees still live and unmerged, e.g. `fd-<slug>-phase-2`. Empty when none.
- `blockers` — STATE.md blockers, verbatim. Empty when unblocked.

Write both files, or neither. If `checkpoint.json` cannot be written, report the failure
rather than leaving CHECKPOINT.md claiming a checkpoint that `/fd-resume` cannot load.

7. Report:
```
✅ Checkpoint saved
   Phase: <N> | Status: <status>
   Files: ~/.fd-plan/<slug>/phases/phase-<N>/CHECKPOINT.md
          ~/.fd-plan/<slug>/checkpoint.json
   Safe to close session. Resume with /fd-resume.
```
