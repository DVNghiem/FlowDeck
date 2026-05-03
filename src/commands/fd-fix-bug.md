---
description: TDD bug fix — explore → research → RED test → GREEN fix → REFACTOR → reviewer → record in FAILURES.json
argument-hint: [bug description] [--scope=path]
---

# Fix Bug

Fix a bug using the TDD red-green-refactor discipline.

**Input:** $ARGUMENTS — description of the bug. Optional `--scope=<path>` to limit search scope.

## Pre-flight

1. Check `.planning/STATE.md` exists — if not, error: "Run /fd-new-project first."
2. Parse `--scope` from arguments (default: entire codebase).
3. Read `.codebase/ARCHITECTURE.md` if available — pass as context.
4. Check `.codebase/FAILURES.json` for prior failures matching the bug description.

## TDD Fix Pipeline (12 steps)

```
[1-2]  Explore + Research  → isolate root cause
[3]    Define behaviors    → acceptance cases for the fix
[4]    RED                 → @tester writes failing regression test
[5]    Confirm             → test MUST fail before proceeding
[6]    GREEN               → @coder implements minimum fix
[7]    Confirm             → test MUST pass before proceeding
[8]    REFACTOR            → clean up (only if GREEN)
[9-10] Verify              → full test suite passes
[11]   Review              → @reviewer confirms + TDD discipline check
[12]   Record              → log fix + regression test in FAILURES.json
```

### Steps 1-2: Explore & Research

- **@researcher**: Investigate bug scope, trace root cause via ARCHITECTURE.md and source files
- **@researcher**: Identify all affected components, list prior similar failures from FAILURES.json

### Step 3: Define Behaviors

Write acceptance cases describing the fix (what should happen after the bug is fixed).

### Step 4: RED — Write Failing Test

- **@tester**: Write a regression test that reproduces the bug (it MUST fail right now)
- Show test output proving it fails

**GUARD: Do NOT proceed if test does not fail RED.**

### Step 5: Confirm RED

Confirm test fails. If it passes, the bug may already be fixed or the test is wrong.

### Step 6: GREEN — Implement Fix

- **@coder**: Implement the minimum code change that makes the regression test pass
- Do not refactor yet

### Step 7: Confirm GREEN

Run test. It MUST pass. **GUARD: Do NOT proceed if test does not pass GREEN.**

### Step 8: REFACTOR

Clean up the implementation. Run tests again to confirm they still pass.

### Steps 9-10: Full Suite

Run the full test suite. All tests must pass.

### Step 11: Review

- **@reviewer**: Confirm fix is correct, no regressions, TDD discipline followed

### Step 12: Record

Append entry to `.codebase/FAILURES.json`:
```json
{
  "id": "F-<N>",
  "type": "bug",
  "description": "<bug description>",
  "affected_paths": ["<files changed>"],
  "root_cause": "<root cause>",
  "fix_applied": "<fix summary>",
  "regression_test": "<test file path>",
  "resolved_at": "<timestamp>"
}
```

## Completion

Report: root cause, fix applied, regression test location, reviewer sign-off.
