---
description: Verify the implementation — run tests, check regression on affect.md files, review and scan; blocks /fd-done on failure
argument-hint: [--topic=<slug>]
---

# Verify

Run the verification pipeline for the active topic. `/fd-done` will not close a task
until this passes.

**Input:** $ARGUMENTS — optional `--topic=<slug>` to target a topic other than the
active one.

## Pre-flight

1. Check `<project-root>/.fd-plan/STATE.md` exists — if not: `"No planning workspace. Run /fd-task first."`
2. Resolve `<topic>` from `--topic`, else from `topic` in STATE.md.
3. Confirm work was implemented — if there are no completed steps or changed files, warn:
   `"No implementation found. Run /fd-execute first."`
4. Read `workflowClass` from STATE.md. FAST verification stays targeted; STANDARD and FULL
   scale regression and review to their risk.

## Step 1: Run tests

Run the project's full test suite. Detect the runner from the project manifest —
`npm test` / `bun test` for Node, `cargo test` for Rust, `pytest` for Python, `go test ./...`
for Go.

All tests must pass. No failures, no unexplained skips.

If no test runner is configured, the agent MUST report that explicitly. The agent MUST NOT
pass silently: `"No test script found — cannot verify. Configure a test runner before /fd-done."`

## Step 2: Browser tests for web projects

Detect a web project by the presence of a frontend framework in the manifest
(`react`, `vue`, `svelte`, `next`, `astro`) or a `public/index.html`.

- **Playwright is configured** (a `playwright.config.*` exists) → run the E2E suite and
  fold the result into the verdict.
- **Web project without Playwright** → suggest adding it, and note that UI behavior is
  unverified in this run. The agent MUST NOT fail the verdict on its absence.
- **Not a web project** → skip this step entirely.

## Step 3: Regression check on affected files

If `<project-root>/.fd-plan/<topic>/affect.md` exists, take its **Affected Files** list as
the regression scope. Otherwise, use changed files from the task's base revision and state
that no planned impact map was available.

For each affected file:
- Confirm it has test coverage. Uncovered changed files are a HIGH finding.
- Use `fdx-graph action:impact target:<file>` (or call `fdx-impact` with `files`) to find dependents not listed in `affect.md`,
  and verify their tests still pass.

Log any dependent that `affect.md` missed — that is a planning gap worth recording.

## Step 4: Review and scan

For FULL or meaningful STANDARD risk, run **Code review (@reviewer)** over the files
changed since the task began:
- Security: secrets, injection, auth gaps
- Quality: critical bugs, missing error handling, TDD discipline
- Conventions: naming, patterns, import style
- Assess coverage in proportion to tier and risk; record uncovered changed files and their
  practical regression risk.
- Any `override_log` entries from `/fd-execute --override`

Run **Security scan (@security-auditor)** when the task touches security-sensitive behavior:
- No hardcoded secrets
- Input validation at trust boundaries
- Auth/authz on protected routes
- No CRITICAL or HIGH vulnerabilities

## Step 5: Report

```
════════════════════════════════════════════════════
VERIFICATION: <topic>
════════════════════════════════════════════════════

| Check           | Status           | Details              |
|-----------------|------------------|----------------------|
| Tests           | ✅ PASS / ❌ FAIL | N/N passed           |
| Browser (E2E)   | ✅ PASS / ⏭️ N/A  | [or: not configured] |
| Regression      | ✅ PASS / ❌ FAIL | [uncovered files]    |
| Code Review     | ✅ PASS / ❌ FAIL | [findings summary]   |
| Security        | ✅ PASS / ❌ FAIL | [findings summary]   |

────────────────────────────────────────────────────
Verdict: ✅ VERIFIED | ❌ NOT VERIFIED
════════════════════════════════════════════════════
```

## No-Go Conditions (automatic NOT VERIFIED)

- Any test failure
- A CRITICAL security vulnerability
- A CRITICAL code-review finding
- A changed file with no relevant verification for its risk (FAST still requires a targeted check)

## Step 6: Go / No-Go

**✅ VERIFIED:**

```
planning-state action:update
  verificationStatus: verified
  last_action: "<topic> verified — all checks passed"
  next_action: "run /fd-done"
```

**❌ NOT VERIFIED** — block `/fd-done` and present the rollback offer:

Record `verificationStatus: not_verified` and `status: blocked` before presenting the
failure report. `/fd-done` reads `verificationStatus`; lifecycle `status` stays within
`planned | in_progress | complete | blocked`.

```
═══════════════════════════════════════════════════════════
❌ NOT VERIFIED — /fd-done is blocked.

Failed checks:
- <check 1: which test/file>
- <check 2: which test/file>

Required fixes:
- [ ] <fix 1>
- [ ] <fix 2>

Options:
  [1] Fix issues and re-run /fd-verify
  [2] Rollback to pre-execute state (git stash + drop worktrees)
  [3] Inspect failures (show full output)
═══════════════════════════════════════════════════════════
```

If user picks [2]:
- Run `git stash push -m "fd-verify rollback: <topic>"`
- Drop any worktrees matching `fd-<slug>-wave-*`
- Update `STATE.md`: `status` → `"blocked"`, `verificationStatus` → `"not_verified"`
- Log: `"Rolled back <topic>. Resume with /fd-execute after fixing root cause."`

Block `/fd-done` until verify passes or rollback is explicitly skipped with `--force`.

Do not write `verified` or `not_verified` into lifecycle `status`.

## Step 7: Update checkpoint

Update `<project-root>/.fd-plan/checkpoint.json`, merging into the existing file:

```json
{
  "current_command": "fd-verify",
  "current_stage": "complete",
  "topic": "<topic>",
  "saved_at": "<ISO timestamp>"
}
```

On a failing verdict, set `"current_stage": "failed"` and record the failures in
`blockers`.

## Error Handling

- `STATE.md` not found → `"No planning workspace. Run /fd-task first."`
- `affect.md` not found → derive scope from changed files and note the missing planned impact map.
- Test runner not found → report with the remedy. The agent MUST NOT pass by default.
- No partial state update on error.

## Completion

Report: verdict, per-check status, required fixes. Next step: `/fd-done` on pass,
`/fd-execute` on fail.
