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

## Pre-flight: Research Gate

**Before investigating the bug**, inspect the failure path and relevant codebase area.

Research scope: `fix-bug`

**CodeGraph Intelligence Check (first):**

```
codegraph action=check
```

- If codegraph indexed: use `codegraph_context` to map the bug area, `codegraph_callers`/`codegraph_callees` to trace the execution path, `codegraph_impact` to identify affected files — before opening any file
  - Log: "codegraph available — using code intelligence for bug investigation"
- If absent: fall back to ARCHITECTURE.md + direct source reads

**Standard pre-flight (always):**

1. Read `.planning/STATE.md` — current phase, freshness
2. Read `.codebase/FAILURES.json` — check for prior similar failures matching the bug description
3. Read `.codebase/ARCHITECTURE.md` if available — codebase structure
4. Read `.codebase/CODEGRAPH.md` if available — codegraph index freshness
5. Check for any `research_fix-bug` evidence in STATE.md from prior research passes
6. Check recent changes via `git log --oneline -10` on relevant files

If existing research is fresh (summaryVersion matches, state fresh within 5 min):
- Reuse the persisted research evidence
- Log: "Research skipped — fresh evidence reused from prior pass"
- Proceed to Explore & Research

If research is stale or missing:
- Run fresh research pass using available MCP and filesystem tools
- Persist results to STATE.md for future reuse
- Log which sources were consulted and what evidence was gathered

> **MCP integration:** When the bug involves external APIs or libraries, invoke configured MCP tools (websearch, docs MCP) to research known failure modes.

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

After recording, refresh the codegraph index so later stages and agents work against the updated codebase:

```
codegraph action=refresh agent=fd-fix-bug
```

If refresh fails, log a warning but do not block — codegraph auto-syncs via file watcher when the MCP server is running.

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
Next step: run `/fd-verify`.
