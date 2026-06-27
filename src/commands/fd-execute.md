---
description: Execute feature implementation from PLAN.md — adaptive TDD pipeline with backend-coder, frontend-coder, devops, tester, reviewer, and STATE.md update
argument-hint: [--phase=N] [--override]
---

# Execute

Implement the current phase's plan using the full FlowDeck TDD agent pipeline.

**Input:** $ARGUMENTS — optional `--phase=N` to target a specific phase, `--override` to bypass guards

## Pre-flight: Research Gate

**Before reading PLAN.md or touching any code**, re-verify the execution context.

Research scope: `execute`

**CodeGraph Intelligence Check (first):**

```
codegraph action=check
```

- If codegraph indexed and fresh: use `codegraph_context` and `codegraph_impact` to understand affected file scope before each implementation step
  - Log: "codegraph available — impact analysis will use code intelligence"
- If codegraph absent or stale after a prior execution run: consider running `/fd-map-codebase --incremental` to rebuild the index before proceeding

**Standard pre-flight (always):**

1. Read `.planning/STATE.md` — verify plan_confirmed, current phase, freshness
2. Read `.codebase/CODEBASE_INDEX.md` if available — check for any file changes since plan was written
3. Read `.codebase/CODEGRAPH.md` if available — check codegraph index freshness
4. Check for any `research_execute` evidence in STATE.md from prior research passes
5. If design-first is required, verify design handoff is complete before proceeding

If existing research is fresh (summaryVersion matches, state fresh within 5 min):
- Reuse the persisted research evidence
- Log: "Research skipped — fresh evidence reused from prior pass"
- Proceed to Guard Check

If research is stale or missing:
- Run fresh research pass using available MCP and filesystem tools
- Persist results to STATE.md for future reuse
- Log which sources were consulted and what evidence was gathered

> **MCP integration:** When implementation requires external library knowledge, invoke configured MCP tools as part of the research pass.
> - **context7** — library docs lookup (first choice for API/docs questions)
> - **sequential-thinking** — break down complex implementation steps
> - **memory** — retrieve prior context from planning or earlier phases
> - **magic** — UI/design system reference for frontend tasks
> - **playwright** — verify browser behavior for frontend implementations
> - **token-optimizer** — compress large context when passing research to implementation agents

## Guard Check

Verify prerequisites:
- `.planning/` directory exists (if not, error: "No active workspace. Run `/fd-init-deep` to initialize, then `/fd-new-feature` to start a feature.")
- `.codebase/` directory exists
- `STATE.md` has `plan_confirmed: true`
- `PLAN.md` exists in current phase directory
- If `requires_design_first: true`, require:
  - `design_stage: handoff_complete`
  - `design_approved: true`
  - OR explicit `--override` with logged reason

Initialize TDD state:
```yaml
tdd:
  stage: behavior
  cycle: 1
  behaviors: []
  regression_test_links: []
```

## Process

### Step 1: Load Plan

Read the active PLAN.md from the current phase directory.
Parse the tasks list and identify which steps are complete.

### Step 2: Identify Next Step

From PLAN.md, find the first step NOT in `steps_complete`.

### Step 3: Pragmatic TDD Cycle (per step)

For each implementation step, run this cycle. Exceptions listed below.

#### BEHAVIOR (mandatory)

Agent states in one paragraph:
- What this function/module does
- Input → output contract
- Edge cases and error conditions

Supervisor validates clarity. If vague → block, ask agent to restate.

Record:
```yaml
tdd:
  stage: behavior
  behaviors:
    - id: "step-N"
      description: "<behavior paragraph>"
      status: pending
```

#### RED (mandatory, except exempt steps)

Agent writes a failing test that captures the BEHAVIOR spec.
- Cover acceptance cases and edge cases
- Use AAA pattern (Arrange-Act-Assert)

Guard verifies test actually fails before proceeding.
If agent skips to GREEN without a failing test → block with:
```
[TDD Guard] Cannot write production code before a failing test exists.
Current stage: behavior
Required: write a failing test first, then implement.
```

Record:
```yaml
tdd:
  stage: red
  behaviors:
    - id: "step-N"
      description: "<behavior>"
      status: red
      test_file: "<path>"
```

#### GREEN

Agent writes minimal code to make the test pass.
- No over-engineering
- No extra abstractions not required by the test
- No speculative features

Record:
```yaml
tdd:
  stage: green
```

#### REFACTOR

Agent cleans up: removes duplication, improves naming, simplifies logic.
- Test must still pass after refactor. If not → back to GREEN.
- Do not refactor if not GREEN.

Record:
```yaml
tdd:
  stage: refactor
```

#### COMMIT (per step)

```yaml
planning-state action:update
  last_action: "Step <N> complete: <summary>"
  steps_complete: [<N>]
  tdd:
    stage: behavior
    cycle: <cycle + 1>
```

After each step that changes source files, refresh the codegraph index so impact analysis stays current for subsequent steps:

```
codegraph action=refresh agent=fd-execute
```

If refresh fails, log a warning but do not block execution — codegraph auto-syncs via file watcher when the MCP server is running.

### Exceptions — skip RED, go straight to GREEN+REFACTOR

The following are exempt from the RED stage:
- **workflow class is "trivial"** — run tests once after changes instead
- **file is config, migration, DTO, constants, type definitions** — no behavior to test
- **step is documentation only** — no code to implement

When exempt, still run BEHAVIOR (brief), then GREEN+REFACTOR, then COMMIT.

### Bugfix exception — RED is a regression test

For `bugfix` workflow class:
- Write a test that reproduces the bug before fixing it
- GREEN = fix that makes the regression test pass
- Record regression test link in `tdd.regression_test_links`

### Step 4: Review Step

Spawn `@reviewer` to check:
- Code quality, security, conventions
- TDD discipline followed
- Test coverage >= 80%
- No missing or weak tests (flag as major finding)

### Step 5: Verify

Run full test suite:
- All tests must pass
- If any fails, revert refactoring

### Step 6: Loop or Complete

If more steps pending:
- Return to Step 2 (identify next step)

If all steps complete:
- Update phase status to "complete"
- Update ROADMAP.md progress
- Present completion summary

## Wave-Based Execution

Execution respects wave structure from PLAN.md:
- Wave 1 steps execute first (with TDD cycle per step)
- Wave 2 steps execute after Wave 1 completes
- Wave 3 steps execute after Wave 2 completes
- No intra-wave dependencies (parallel execution)

## Guards Summary

| Transition | Guard | If Violated |
|-----------|-------|-------------|
| behavior → red | Behavior spec is clear and complete | Block until restated |
| red → green | Test written and fails | Block until test fails |
| green → refactor | Tests pass | Block until green |
| refactor → commit | Tests still pass | Block until all pass |

## Override Mechanism

User can override with `/fd-execute --override`:
- Every override is logged in `override_log`
- Surface override in next review
- Flag in deploy check

## Error Handling

- If guard check fails: abort with clear error and remediation
- If implementation agent fails: report failure, offer retry or skip
- If @reviewer finds critical issues: return to GREEN for fixes
- No partial state saved on error

## State Updates

STATE.md updates after each step:
```yaml
steps_complete: [1, 2]      # Added after step 2
steps_pending: [3, 4, 5]   # Removed step 2
last_action: "Step 2 TDD complete: [behavior] (RED→GREEN→REFACTOR)"
tdd:
  stage: behavior
  cycle: 2
  behaviors_completed: 2
```

Full phase completion:
```yaml
status: complete
last_action: "Phase N TDD complete — all steps finished"
tdd:
  stage: complete
  cycles_used: N
  behaviors_completed: M
```

## Completion

Report: feature implemented, tests status, reviewer findings, files changed. Suggest running `/fd-verify`.
