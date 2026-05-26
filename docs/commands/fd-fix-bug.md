# /fd-fix-bug

**Purpose:** Diagnose, fix, and verify a bug using TDD-based workflow with regression test.

## Usage

```
/fd-fix-bug [bug description] [--scope=path]
```

**Note:** `bug description` is required. `--scope=path` is optional.

## Arguments

- `bug description` — description of the bug or reproduction steps
- `--scope=path` (optional) — limit search scope to a specific path

## What Happens

The workflow enforces the TDD cycle with guards at each transition:

```
BEHAVIOR → RED → GREEN → REFACTOR → complete
   ↑______________|         |
   (loop if needed)         |
                     Only if GREEN
```

### Pre-flight: Research Gate

Before investigating the bug, inspect relevant context:

1. Check codegraph availability (`codegraph action=check`). If indexed, use `codegraph_context`, `codegraph_callers`, `codegraph_callees`, and `codegraph_impact` for symbol-level understanding.
2. Read `.planning/STATE.md` — current phase, freshness.
3. Read `.codebase/FAILURES.json` — check for prior similar failures.
4. Read `.codebase/ARCHITECTURE.md` and `.codebase/CODEGRAPH.md` if available.
5. Check `research_fix-bug` evidence in STATE.md from prior research passes.
6. Check recent changes via `git log --oneline -10` on relevant files.

If research is fresh (within 5 minutes), reuse it and log: "Research skipped — fresh evidence reused from prior pass."

### Steps 1-2: Explore and Research

- **@researcher** investigates bug scope, traces root cause via ARCHITECTURE.md and source files.
- **@researcher** identifies all affected components and prior similar failures from FAILURES.json.
- Reproduce the bug with minimal case; document inputs and expected vs actual behavior.

### Step 3: Define Behaviors

Write acceptance cases describing what should happen after the bug is fixed.

### Step 4: Isolate Root Cause

- Trace the execution path.
- Read stack trace completely.
- Check recent changes: `git log --oneline -20 -- <file>`.
- Identify root cause (not symptom).

### Step 5: RED — Write Failing Test

- **@tester** writes a regression test that reproduces the bug (it MUST fail right now).
- Show test output proving it fails.

**GUARD: Do NOT proceed if test does not fail RED.**

### Step 6: GREEN — Implement Fix

- Implementation agent (`@backend-coder`, `@frontend-coder`, or `@devops`) implements the minimum code change that makes the regression test pass.
- Do not refactor yet.

**GUARD: Do NOT proceed if test does not pass GREEN.**

### Step 7: REFACTOR

Clean up the implementation. Run tests again to confirm they still pass.

### Steps 8-9: Full Suite and Review

- Run the full test suite. All tests must pass.
- **@reviewer** confirms fix is correct, no regressions, TDD discipline followed.

### Step 10: Record

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

Refresh the codegraph index after recording:
```
codegraph action=refresh agent=fd-fix-bug
```

## Guards Summary

| Transition | Guard | If Violated |
|-----------|-------|-------------|
| behavior → red | Test written and fails | Block until test fails |
| red → green | Test exists and fails | Block until test passes |
| green → refactor | Tests are green | Block until green |
| refactor → complete | All tests pass | Block until all pass |

## Error Handling

- **GUARD VIOLATION**: If implementation agent attempts to skip RED or GREEN phase, block and return to correct phase.
- **Override mechanism**: User can override with `/fd-fix-bug --override` but every override is logged in `override_log`.
- If root cause unclear: spawn `@debug-specialist` for deeper analysis.
- If fix breaks tests: revert, reassess root cause, never suppress error.

## Output / State

- Root cause identified
- Fix applied to affected files
- Regression test created at `<test file path>`
- Reviewer sign-off received
- Entry appended to `.codebase/FAILURES.json`
- Codegraph index refreshed

## Examples

**Fix a bug with description:**
```
/fd-fix-bug "Login fails when password contains special characters"
```

**Fix a bug scoped to a specific path:**
```
/fd-fix-bug "Session timeout error" --scope=src/auth
```

## Related Commands

- `/fd-verify` — run full verification suite after fix
- `/fd-discuss` — investigate before filing a bug report
- `/fd-deploy-check` — run pre-deployment checks after fix is complete