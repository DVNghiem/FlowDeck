---
description: Implement the task plan with the TDD pipeline — parallel worktree guard when affect.md exists, checkpoint after each step
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

**Graph freshness check (MUST run before any worktree is created):**

- Run `fdx-graph action:report` to check graph freshness (mtime in the report header).
  Stale (>30 min) → run `fdx-graph action:build` first.
- Use `fdx-graph action:impact target:<file>` to confirm the affected file scope
  before each implementation step.
- Before delegating to a subagent, run `fdx-graph action:impact` on the target file
  and include the result in the subagent's context packet under "Blast radius".

You are the single writer for `action:build`. Subagents use read actions only —
`fdx-graph` does not wait on lock contention, so a parallel wave that all
tried to build would have every agent but one told "another build is in progress".

**Artifact validation (MUST run both before any worktree is created):**

1. `fdx-validate action:artifacts topic:<topic>` — artifact format check
2. `fdx-validate action:pre-execute topic:<topic>` — file existence + freshness check

If either returns `valid: false` → STOP and show errors.
Both MUST pass before execution proceeds.

**Standard pre-flight (always):**

1. Read `<project-root>/.fd-plan/STATE.md` — verify `plan_confirmed`, active `topic`, freshness
2. Read `<project-root>/.fd-plan/.codebase/CODEBASE_INDEX.md` if available — file changes since the plan was written
3. Check for `research_execute` evidence in STATE.md from a prior pass

If existing research is fresh (summaryVersion matches, state fresh within 5 min), reuse
it and log `"Research skipped — fresh evidence reused from prior pass"`. Otherwise run a
fresh pass and persist the result.

## Guard Check

Resolve `<topic>` from `--topic`, else from `topic` in STATE.md.

Verify:
- `task.md` exists.
- For FULL, `architecture.md`, `affect.md`, and `plan.md` exist (the validator enforces this).
- For FAST/STANDARD, `plan.md` may be absent; use the inline implementation and
  verification steps in `task.md`. `affect.md` is optional; without it, execute
  sequentially in the current worktree and derive the verification scope from changed files.
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

Run this **before spawning any worktree**. The agent MUST NOT create a worktree until the guard
has classified every task.

```
PARALLEL GUARD (run before spawning worktrees):
1. If `affect.md` exists, read it and build the file list per task/wave. Otherwise use
   the files identified in `task.md` and run sequentially.
2. For each pair of tasks: compute the file intersection.
3. Empty intersection    → safe to run in parallel; create worktree fd-<slug>-wave-<N>.
4. Non-empty intersection → run sequentially, log the reason.
5. After all parallel worktrees finish → the orchestrator merges the results.
6. On merge conflict → PAUSE, report to the human. The agent MUST NOT auto-resolve.
7. Clean up each worktree after its merge, unless --keep-worktree was passed.
```

**Worktree naming:** `fd-<project-slug>-wave-<N>`, where `<project-slug>` is the
project directory name — the same slug used for `<project-root>/.fd-plan/`.

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

Read `plan.md` when present and parse its task list. Otherwise use the inline implementation
steps in `task.md`. Identify which steps are already complete from STATE.md/checkpoint.

### Step 2: Identify Next Step

Find the first step not in `steps_complete`.

### Step 3: Pragmatic TDD Cycle (per step)

#### BEHAVIOR (mandatory)

The agent states in one paragraph:
- What this function/module does
- Input → output contract
- Edge cases and error conditions

The supervisor validates clarity. Vague → block. The agent MUST NOT proceed until the agent restates.

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

Remove duplication, improve naming, simplify. Tests MUST still pass — if not, back to
GREEN. The agent MUST NOT refactor unless GREEN.

#### CHECKPOINT (per step)

```yaml
planning-state action:update
  last_action: "Step <N> complete: <summary>"
  steps_complete: [<N>]
  tdd:
    stage: behavior
    cycle: <cycle + 1>
```

After each parallel wave completes, refresh the graph so impact analysis stays
current:

Run `fdx-graph action:build` after each wave. The build is incremental via content
hashing, so an unchanged repo costs nothing. Run it yourself — never delegate a
build into a wave.

### Exceptions — skip RED, go straight to GREEN+REFACTOR

- **Trivial task** (rename, typo, config value) — run tests once after the change
- **Config, migration, DTO, constants, or type-definition files** — no behavior to test
- **Documentation-only step** — no code to implement

When exempt, still run BEHAVIOR (brief), then GREEN+REFACTOR, then CHECKPOINT.

### Bugfix steps — RED is a regression test

When a step fixes a bug, write a test that reproduces it before fixing. GREEN is the fix
that makes the regression test pass. Record the link in `tdd.regression_test_links`.

### Step 4: Review Step

For FULL or meaningful STANDARD risk, spawn `@reviewer` to check code quality, security,
conventions, TDD discipline, and test coverage proportionate to the risk. FAST tasks usually
skip this step unless a security or repeated-failure signal appears.

### Step 5: Verify

Run verification appropriate to the tier: targeted checks for FAST, targeted plus regression
tests for STANDARD, and the broad test plan for FULL. If a check fails, fix the cause before
continuing; do not revert user work automatically.

### Step 6: Loop or Complete

More steps pending → return to Step 2. All steps complete → update status and present
the completion summary.

## Wave-Based Execution

When `plan.md` exists, waves run in order: Wave 2 starts only after Wave 1 completes. Within
a wave, steps run in parallel only where the Parallel Guard cleared them. Inline task steps
run in order unless disjoint files and an impact map justify parallel work.

### After each wave: update checkpoint

Update `<project-root>/.fd-plan/checkpoint.json`, merging into the existing file:

```json
{
  "current_command": "fd-execute",
  "current_stage": "wave-<N>",
  "topic": "<topic>",
  "worktrees": ["fd-<slug>-wave-<N>"],
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
| refactor → checkpoint | Tests still pass | Block until all pass |

## Override Mechanism

`/fd-execute --override` bypasses the guard check. Every override is logged in
`override_log` and surfaced in `/fd-verify`.

## Error Handling

- Guard check fails → abort with the exact missing prerequisite and its remedy
- `plan.md` missing for FAST/STANDARD → use inline steps in `task.md`.
- `affect.md` missing → run sequentially and derive verification scope from changed files.
- Implementation agent fails → report, offer retry or skip
- Merge conflict → PAUSE and report. The agent MUST NOT auto-resolve.
- `@reviewer` finds critical issues → return to GREEN for fixes
- No partial state saved on error

## Completion

Report: steps implemented, test status, reviewer findings, files changed, worktrees
merged and cleaned. Next step: `/fd-verify`.
