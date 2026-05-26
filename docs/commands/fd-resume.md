# /fd-resume

**Purpose:** Reload STATE.md, PLAN.md, and DISCUSS.md to continue an interrupted session — brief the user, PAUSE for confirmation, then resume from where work stopped.

## Usage

/fd-resume [--yes]

## What Happens

1. **Pre-flight check.**
   - Verify `.planning/STATE.md` exists — error if not ("No active feature. Run `/fd-map-codebase` then `/fd-new-feature` to start a feature.")

2. **Read and parse STATE.md.** Extract phase, status, last_updated, plan_confirmed.

3. **Read PLAN.md** (`.planning/phases/phase-<N>/PLAN.md`) if it exists — show preview (first 20 lines).

4. **Read DISCUSS.md** (`.planning/phases/phase-<N>/DISCUSS.md`) if it exists — show decision count.

5. **Present session summary:**

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

6. **PAUSE for confirmation** (unless `--yes` is passed). Wait for user to type CONFIRM.

7. **After confirmation:**
   - If `plan_confirmed: true` and PLAN.md has uncompleted steps → proceed with implementation
   - If no plan exists → suggest running `/fd-plan`
   - Brief the user on what the next step is before starting

## Output / State

No new files created. Resumes from existing STATE.md and PLAN.md.

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
- `/fd-plan` — create a plan if no PLAN.md exists to resume
- `/fd-execute` — continue implementation (auto-triggered after CONFIRM)
