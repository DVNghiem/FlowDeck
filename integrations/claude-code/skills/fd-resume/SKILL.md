---
name: fd-resume
description: Restore FlowDeck task progress from checkpoint or compatible state
disable-model-invocation: true
argument-hint: "[--yes]"
---

# FlowDeck resume

Resume only the active task on this host. `$ARGUMENTS` may include `--yes` to skip the confirmation pause. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" read` from the project root. If missing, run `status` for the exact remedy; never initialize or overwrite state while trying to resume.

Read `checkpoint.json` first. If it is present and readable, use its schema/version, topic, command, stage, phase progress, worktrees, blockers, lifecycle, verification, and tier. Read `STATE.md` as well to fill missing fields. If checkpoint is absent, unreadable, or unsupported, fall back to readable STATE and explicitly report the fallback. If neither is readable, stop and report recovery options; do not fabricate progress.

Validate the active topic directory and inspect its tier artifacts: task, optional affect, and FULL architecture/plan. Show requirement count and a short plan/inline-steps preview. Summarize source used, project root, topic, current command/stage, lifecycle, verification, tier, plan confirmation, completed/pending steps, blockers, and worktrees. If state ownership points at another project or an unattributed legacy directory, do not silently migrate or resume it.

Present the summary and wait for explicit `CONFIRM` before continuing unless `--yes` was passed. `--yes` skips only this pause; it does not bypass blockers, missing approvals, or safety checks. If blockers exist, report them and stop. If worktrees remain, list them and ask whether to reuse or recreate; do not create a conflicting writer.

Resume at the saved command and stage, skipping only stages with recorded completion evidence. Do not replay completed work or skip an unfinished dependency. If no checkpoint exists, use state: confirmed task plus pending steps resumes at `/flowdeck:fd-execute`; absent task starts `/flowdeck:fd-task`. Brief the user on the next action. Save a new checkpoint after meaningful progress. Do not claim cross-host resume or concurrent-write locking.
