---
description: Close a verified task by comparing requirements with evidence and reporting remaining work
argument-hint: [--topic=<slug>]
---

# Done

Resolve `<slug>` from `planning-state action:read`'s `planning_root`; never infer
the planning directory from the project basename.

Close the active task only after verification, without mutating the repository.

**Input:** $ARGUMENTS — optional `--topic=<slug>` to select a topic.

## Step 1: Verify gate

Read `~/.fd-plan/<slug>/STATE.md` using `planning-state action:read`. Resolve the
active topic unless `--topic` names another one. If the workspace or `task.md` is
missing, point to `/fd-task`. Require `verification: verified` and no blockers.
Legacy state with `status: verified` is read through the compatibility parser; do
not write that value again. If verification is absent or failed, stop and direct
the user to `/fd-verify`.

## Step 2: Compare evidence

Read every requirement and acceptance criterion in the topic's `task.md`. Compare
with the actual diff, test output, review findings where required by
`workflowClass`, and saved checkpoint. Mark each criterion met or unmet and cite
its evidence. Do not infer success from an agent summary. If any required criterion
is unmet, leave the task open and report the gap.

Read `affect.md` only when present. FAST and STANDARD tasks may have inline steps
instead of `plan.md`; FULL requires all four planning artifacts.

## Step 3: Close state

When every required criterion is met, update state with `status: complete`,
`verification: verified`, `last_action: "<topic> closed via /fd-done"`, and
`next_action: "run /fd-task to start the next task"`. Save the checkpoint with
`current_command: "fd-done"`, `current_stage: "complete"`, `status: "complete"`,
`topic`, and `saved_at`. Preserve existing checkpoint fields.

Report requirements met, verification evidence, changed files, and whether a
commit or push was performed earlier by explicit user request. You may propose a
commit message and next steps, but **never run git commit, git push, deploy, or a
destructive repository action as part of `/fd-done`**. Those require a separate
explicit instruction from the user.

If saving state or checkpoint fails, report the error and do not claim completion.
