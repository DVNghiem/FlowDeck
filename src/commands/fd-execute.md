---
description: Implement plan.md with the TDD pipeline — parallel worktree guard from affect.md, wave-based execution, checkpoint after each wave
argument-hint: [--topic=<slug>] [--override] [--keep-worktree]
---

# Execute

Implement the confirmed plan using the FlowDeck TDD agent pipeline.

**Input:** $ARGUMENTS — optional `--topic=<slug>` to target a topic other than the
active one, `--override` to bypass guards, `--keep-worktree` to skip worktree cleanup
after merge.

## Pre-flight: Research Gate

**Before reading `plan.md` or touching any code**, re-verify the execution context.

Research scope: `execute`

**CodeGraph Intelligence Check (first):**

```
codegraph action=check
```

- Indexed and fresh → use `codegraph_context` and `codegraph_impact` to confirm the
  affected file scope before each implementation step.
- Absent or stale → run `codegraph action=refresh` before proceeding.

**Standard pre-flight (always):**

1. Read `~/.fd-plan/<slug>/STATE.md` — verify `plan_confirmed`, active `topic`, freshness
2. Read `~/.fd-plan/<slug>/.codebase/CODEBASE_INDEX.md` if available — file changes since the plan was written
3. Check for `research_execute` evidence in STATE.md from a prior pass

If existing research is fresh (summaryVersion matches, state fresh within 5 min), reuse
it and log `"Research skipped — fresh evidence reused from prior pass"`. Otherwise run a
fresh pass and persist the result.

## Guard Check

Resolve `<topic>` from `--topic`, else from `topic` in STATE.md.

Verify:
- `~/.fd-plan/<slug>/` exists — if not: `"No planning workspace. Run /fd-task first."`
- `STATE.md` has `plan_confirmed: true`
- `~/.fd-plan/<slug>/<topic>/plan.md` exists
- `~/.fd-plan/<slug>/<topic>/affect.md` exists. If missing, abort with:
  ```
  Error: affect.md not found. Run /fd-task first.
  ```
- If `requires_design_first: true`, require `design_stage: handoff_complete` and
  `design_approved: true` (set by `/fd-review`), OR explicit `--override` with a
  logged reason.

Initialize TDD state:
```yaml
tdd:
  stage: behavior
  cycle: 1
  behaviors: []
  regression_test_links: []
```

## Parallel Guard

Run this **before spawning any worktree**. No worktree may be created until the guard
has classified every task.

```
PARALLEL GUARD (run before spawning worktrees):
1. Read affect.md → build the file list per task/wave.
2. For each pair of tasks: compute the file intersection.
3. Empty intersection    → safe to run in parallel; create worktree fd-<slug>-phase-<N>.
4. Non-empty intersection → run sequentially, log the reason.
5. After all parallel worktrees finish → the orchestrator merges the results.
6. On merge conflict → PAUSE, report to the human, do not auto-resolve.
7. Clean up each worktree after its merge, unless --keep-worktree was passed.
```

**Worktree naming:** `fd-<project-slug>-phase-<N>`, where `<project-slug>` is the
project directory name — the same slug used for `~/.fd-plan/<slug>/`.

Log the guard's decision before execution starts:

```
Parallel guard: <X> task(s) parallel, <Y> sequential
  parallel:   Task A, Task B
  sequential: Task C — shares file1.ts with Task A
```

The guard's classification overrides the plan's wave grouping. Two steps in the same
wave whose file lists intersect run in order, not together.

## Process

### Step 1: Load Plan

Read `~/.fd-plan/<slug>/<topic>/plan.md`. Parse the task list and identify which steps
are already complete.

### Step 2: Identify Next Step

Find the first step not in `steps_complete`.

### Step 3: Pragmatic TDD Cycle (per step)

#### BEHAVIOR (mandatory)

The agent states in one paragraph:
- What this function/module does
- Input → output contract
- Edge cases and error conditions

The supervisor validates clarity. Vague → block, ask the agent to restate.

#### RED (mandatory, except exempt steps)

The agent writes a failing test that captures the BEHAVIOR spec, covering acceptance
cases and edge cases, using AAA (Arrange-Act-Assert).

The guard verifies the test actually fails before proceeding. If the agent skips to
GREEN without a failing test → block with:
```
[TDD Guard] Cannot write production code before a failing test exists.
Current stage: behavior
Required: write a failing test first, then implement.
```

#### GREEN

Minimal code to make the test pass. No over-engineering, no abstractions the test does
not require, no speculative features.

#### REFACTOR

Remove duplication, improve naming, simplify. Tests must still pass — if not, back to
GREEN. Do not refactor unless GREEN.

#### COMMIT (per step)

```yaml
planning-state action:update
  last_action: "Step <N> complete: <summary>"
  steps_complete: [<N>]
  tdd:
    stage: behavior
    cycle: <cycle + 1>
```

After each step that changes source files, refresh the codegraph index so impact
analysis stays current:

```
codegraph action=refresh agent=fd-execute
```

If refresh fails, log a warning but do not block — codegraph auto-syncs via its file
watcher when the MCP server is running.

### Exceptions — skip RED, go straight to GREEN+REFACTOR

- **Trivial task** (rename, typo, config value) — run tests once after the change
- **Config, migration, DTO, constants, or type-definition files** — no behavior to test
- **Documentation-only step** — no code to implement

When exempt, still run BEHAVIOR (brief), then GREEN+REFACTOR, then COMMIT.

### Bugfix steps — RED is a regression test

When a step fixes a bug, write a test that reproduces it before fixing. GREEN is the fix
that makes the regression test pass. Record the link in `tdd.regression_test_links`.

### Step 4: Review Step

Spawn `@reviewer` to check code quality, security, conventions, TDD discipline, and test
coverage ≥ 80%. Missing or weak tests are a major finding.

### Step 5: Verify

Run the full test suite. All tests must pass. If any fails, revert the refactoring.

### Step 6: Loop or Complete

More steps pending → return to Step 2. All steps complete → update status and present
the completion summary.

## Wave-Based Execution

Waves from `plan.md` run in order: Wave 2 starts only after Wave 1 completes. Within a
wave, steps run in parallel only where the Parallel Guard cleared them.

### After each wave: update checkpoint

Update `~/.fd-plan/<slug>/checkpoint.json`, merging into the existing file:

```json
{
  "current_command": "fd-execute",
  "current_stage": "wave-<N>",
  "topic": "<topic>",
  "worktrees": ["fd-<slug>-phase-<N>"],
  "saved_at": "<ISO timestamp>"
}
```

Clear a worktree from `worktrees` once it is merged and cleaned up.

## Guards Summary

| Transition | Guard | If Violated |
|-----------|-------|-------------|
| behavior → red | Behavior spec is clear and complete | Block until restated |
| red → green | Test written and fails | Block until test fails |
| green → refactor | Tests pass | Block until green |
| refactor → commit | Tests still pass | Block until all pass |

## Override Mechanism

`/fd-execute --override` bypasses the guard check. Every override is logged in
`override_log` and surfaced in `/fd-verify`.

## Error Handling

- Guard check fails → abort with the exact missing prerequisite and its remedy
- `affect.md` missing → `"Error: affect.md not found. Run /fd-task first."`
- Implementation agent fails → report, offer retry or skip
- Merge conflict → PAUSE and report; never auto-resolve
- `@reviewer` finds critical issues → return to GREEN for fixes
- No partial state saved on error

## Completion

Report: steps implemented, test status, reviewer findings, files changed, worktrees
merged and cleaned. Next step: `/fd-verify`.
