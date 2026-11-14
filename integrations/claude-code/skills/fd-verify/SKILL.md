---
name: fd-verify
description: Verify a FlowDeck implementation against acceptance criteria and record an honest verdict
disable-model-invocation: true
argument-hint: "[topic]"
---

# FlowDeck verify

Verification is mandatory for every tier and is separate from lifecycle status. `$ARGUMENTS` may select a topic; confirm it exists. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" status [topic]`, resolve the canonical root from its output, and read `task.md`, changed files, current state, and checkpoint. If no task or no completed implementation steps exist, report that and direct the user to `/flowdeck:fd-task` or `/flowdeck:fd-execute`.

## Verification scope

- **FAST:** run targeted tests/checks for the changed behavior plus required final checks.
- **STANDARD:** run relevant tests and regressions for changed modules.
- **FULL:** run the complete test, lint, typecheck, and build gates applicable to the project; complete independent code review, and security review when the change is security-sensitive.

Detect commands from repository manifests and project instructions; do not guess a runner. If no test runner exists, report verification cannot be complete. For web projects, run configured Playwright/E2E tests. If none is configured, say UI behavior remains unverified, but do not make absence of Playwright alone a failure.

Read `affect.md` when present. Otherwise derive the affected files from the actual diff and inline steps. Confirm meaningful changed files have tests and run their regressions. Use FDX impact only if `fdx --version` succeeds; otherwise inspect imports/callers and disclose the graph gap. Do not claim coverage percentages unless measured. Report pre-existing failures separately from failures introduced by this change.

For a review, inspect the actual diff against task criteria, conventions, edge cases, security, and test evidence. FULL requires a real independent reviewer; security-sensitive work requires a real security review. If unavailable, say so and leave the verdict `not_verified` where this is a required gate. Do not fabricate agent output, tool output, or a passing result.

## Verdict

Use **verified** only when acceptance criteria are met and all required checks pass with evidence. Any unexplained test failure, critical review/security finding, or unverified required criterion means **not_verified**. For missing coverage, state which changed files lack tests and the concrete remedy.

On success, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" set verification verified`, then checkpoint `fd-verify complete`. On failure, set `verification not_verified`, record concrete blockers, and checkpoint `fd-verify failed`. Keep lifecycle `status` within `planned|in_progress|complete|blocked`; never write `status: verified`. Preserve existing checkpoint fields. If state persistence fails, report it and do not claim a saved verdict.

Never perform rollback from verification without the user's explicit authorization. If the user asks to roll back, first explain the affected working changes and use the supported git recovery approach only after authorization. Do not commit, push, or deploy.

Report per-check status, exact commands/results, acceptance criteria met/unmet, review/security findings, pre-existing failures, and the next step: `/flowdeck:fd-done` on verified, `/flowdeck:fd-execute` otherwise.
