---
name: fd-execute
description: Implement the approved FlowDeck task in checked steps using TDD and resumable checkpoints
disable-model-invocation: true
argument-hint: "[topic]"
---

# FlowDeck execute

Implement only the approved task and its tier-appropriate steps. `$ARGUMENTS` may select a topic; validate it against `state.mjs status`. Work from the repository root and resolve planning paths from the state command output, not the project basename.

## 1. Preflight

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" status [topic]`. Verify an active topic, `plan_confirmed: true`, and expected lifecycle. FAST/STANDARD use `task.md` inline steps; FULL requires `task.md`, `affect.md`, and `plan.md` (and architecture for context). Missing required artifacts, unresolved blocking review findings, or unapproved FULL execution means stop and name the remedy (`/flowdeck:fd-task` or `/flowdeck:fd-review`).

Read relevant state, checkpoint, artifacts, project instructions, changed files, and tests. Recheck repository freshness and callers. If `fdx` exists, use its documented commands for impact and graph context; if unavailable, inspect source references and say graph impact is unknown. Do not claim an FDX check that was not run.

Claude Code does not provide OpenCode's tools, worktree guard, supervisor, or automatic checkpoint hook. Use Claude's ordinary file, search, Bash, and Task tools. If using subagents, assign disjoint files, state their input/output, include known impact, and do not let multiple writers edit overlapping files. FAST stays in the current worktree. For STANDARD/FULL, only use separate worktrees when ownership is provably disjoint; shared files run sequentially. On merge conflict, stop and report rather than resolving automatically.

## 2. Execute one step at a time

Read the approved steps and identify what is already complete from the task/plan and checkpoint. Execute waves in order; do not start a dependent wave early. Before each behavior change:

1. State the intended behavior, input/output contract, and important edge cases.
2. Write a regression or behavior test first and run it to show it fails for the intended reason (RED). For a bug fix, reproduce the bug.
3. Make the smallest implementation that passes (GREEN).
4. Refactor only after green; rerun the relevant tests (REFACTOR).
5. Record evidence and mark the step complete only after its checks pass.

RED may be skipped for typo/rename, docs-only, or mechanical config/type changes with no behavior; explain the exception and still run an appropriate check. Do not add speculative features or disable a failing test to get green. Distinguish a verified baseline failure from a regression with evidence.

Use bounded foreground commands. Ask before destructive operations, publishing, deployment, or changes outside the requested scope. Never auto-commit or push. Do not claim the PreToolUse policy hook catches every shell/subprocess path; host permissions and OS isolation remain separate controls.

## 3. Progress and recovery

After every completed step, update task/plan checkboxes and state (`status in_progress`, `last_action`, `next_action`), then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs checkpoint fd-execute <stage>`. Preserve old checkpoint fields. Record step numbers, blockers, files, verification status, and live worktrees accurately. Planning-state/checkpoint writes are not source progress for loop-detection purposes.

If a check fails, keep the step incomplete, record the command and relevant failure, and fix the cause or report the blocker. On interrupt, checkpoint before stopping when possible. Do not mark task complete here.

## 4. Tier review and verification

- **FAST:** targeted checks after each change; final `/flowdeck:fd-verify` is still mandatory.
- **STANDARD:** relevant regression suite, review when risk or complexity warrants it.
- **FULL:** complete each planned wave, obtain independent review, run comprehensive verification, and obtain security review for security-sensitive work. If separate agents are unavailable, report the missing independent review instead of claiming it occurred.

Report completed and pending steps, changed files, actual test commands/results, review findings, blockers, worktrees, and checkpoint. Next step: `/flowdeck:fd-verify`.
