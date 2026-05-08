---
description: TDD bug fix — explore → research → RED test → GREEN fix → REFACTOR → reviewer → record in FAILURES.json
argument-hint: [bug description] [--scope=path]
---

# Fix Bug

Fix a bug using the TDD red-green-refactor discipline.

**Input:** $ARGUMENTS — description of the bug. Optional `--scope=<path>` to limit search scope.

## Prerequisites

- `.planning/` initialized
- Bug description or reproduction steps available

## TDD Cycle

The workflow enforces the TDD cycle with guards at each transition:

```
BEHAVIOR → RED → GREEN → REFACTOR → complete
   ↑______________|         |
   (loop if needed)         |
                     Only if GREEN
```

## Pre-flight

1. Check `.planning/STATE.md` exists — if not, error: "Run /fd-new-project first."
2. Parse `--scope` from arguments (default: entire codebase).
3. Read `.codebase/ARCHITECTURE.md` if available — pass as context.
4. Check `.codebase/FAILURES.json` for prior failures matching the bug description.

## Process

### Steps 1-2: Explore & Research

- **@researcher**: Investigate bug scope, trace root cause via ARCHITECTURE.md and source files
- **@researcher**: Identify all affected components, list prior similar failures from FAILURES.json

Reproduce the bug with minimal case; document inputs and expected vs actual.

### Step 3: Define Behaviors

Write acceptance cases describing the fix (what should happen after the bug is fixed).

### Step 4: Isolate Root Cause

Spawn `@researcher` to investigate:
- Trace the execution path
- Read stack trace completely
- Check recent changes: `git log --oneline -20 -- <file>`
- Identify root cause (not symptom)

### Step 5: RED — Write Failing Test

- **@tester**: Write a regression test that reproduces the bug (it MUST fail right now)
- Show test output proving it fails

**GUARD: Do NOT proceed if test does not fail RED.**

### Step 6: Confirm RED

Confirm test fails. If it passes, the bug may already be fixed or the test is wrong.

### Step 7: GREEN — Implement Fix

- **Implementation agent (`@backend-coder` / `@frontend-coder` / `@devops`)**: Implement the minimum code change that makes the regression test pass
- Do not refactor yet

**GUARD: Do NOT proceed if test does not pass GREEN.**

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

## Error Handling

- **GUARD VIOLATION**: If implementation agent attempts to skip RED or GREEN phase, block and return to correct phase
- **Override mechanism**: User can override with `/fd-fix-bug --override` but every override is logged in `override_log`
- If root cause unclear: spawn `@debug-specialist` for deeper analysis
- If fix breaks tests: revert, reassess root cause, never suppress error

## Guards Summary

| Transition | Guard | If Violated |
|-----------|-------|-------------|
| behavior → red | Test written and fails | Block until test fails |
| red → green | Test exists and fails | Block until test passes |
| green → refactor | Tests are green | Block until green |
| refactor → complete | All tests pass | Block until all pass |

## Completion

Report: root cause, fix applied, regression test location, reviewer sign-off.
