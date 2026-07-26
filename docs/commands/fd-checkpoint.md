# /fd-checkpoint

**Purpose:** Force-save mid-session checkpoint to STATE.md and write a CHECKPOINT.md summary — safe to close the session and resume later with `/fd-resume`.

## Usage

/fd-checkpoint

## What Happens

1. **Pre-flight check.**
   - Verify `.planning/STATE.md` exists — error if not found ("No active project to checkpoint.")

2. **Read current STATE.md.** Parse phase, status, steps_complete, and other tracked fields.

3. **Update STATE.md.**
   - Set `last_updated` to current timestamp
   - Ensure `status` reflects current state accurately
   - Scan `.planning/phases/phase-<N>/PLAN.md` for completed steps and update `steps_complete` if tracked

4. **Write CHECKPOINT.md.** Creates `.planning/phases/phase-<N>/CHECKPOINT.md`:

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

5. **Report.** Present checkpoint summary including phase, status, file path, and the `/fd-resume` command.

## Output / State

Files created:
- `.planning/phases/phase-<N>/CHECKPOINT.md`

STATE.md updates:
```yaml
last_updated: "<timestamp>"
status: <current status>
steps_complete: [1, 2, ...]   # if tracked in PLAN.md
```

## Examples

```
/fd-checkpoint
```

Save a checkpoint for the current session. Safe to close afterward.

## Related Commands

- `/fd-resume` — reload the checkpointed state and continue
- `/fd-map-codebase` — map the codebase (required before starting a feature)
