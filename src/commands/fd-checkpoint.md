---
description: Force-save current state to STATE.md — safe to close session
---

# Checkpoint

Save the current session state so work can be safely resumed later.

## Steps

1. Check `.planning/STATE.md` exists — if not, error: "No active workspace. Run `/fd-map-codebase` to initialize, then `/fd-new-feature` to start a feature."

2. Read current STATE.md content.

3. Update STATE.md:
   - Set `last_updated` to current timestamp
   - Ensure `status` reflects current state accurately

4. If `.planning/phases/phase-<N>/PLAN.md` exists, scan for completed steps and update STATE.md's `steps_complete` if tracked.

5. Write a brief checkpoint summary to `.planning/phases/phase-<N>/CHECKPOINT.md`:

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

6. Report:
```
✅ Checkpoint saved
   Phase: <N> | Status: <status>
   File: .planning/phases/phase-<N>/CHECKPOINT.md
   Safe to close session. Resume with /fd-resume.
```
