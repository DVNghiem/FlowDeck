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

### Step 1: Guard Check

Each plan step follows the TDD cycle:

```
BEHAVIOR → RED → GREEN → REFACTOR → next step
   ↑_________|        |
   (loop if needed)  Only if GREEN
```

## Process

## Workflow-Aware Execution

Read STATE.md to determine the workflow class:
- `quick` / `docs-only`: Skip full TDD cycle. Run tests once after changes.
- `standard` / `explore` / `ui-heavy` / `verify-heavy` / `bugfix`: Follow full TDD cycle.

For `quick` workflows:
- Step 5 (Write Failing Tests) → Skip. Run existing tests after implementation.
- Step 6 (Confirm RED) → Skip.
- Step 7 (Implement Minimum) → Run directly.
- Step 8 (Confirm GREEN) → Run tests after implementation.
- Step 9 (Refactor) → Optional. Skip if no refactoring needed.

For all other workflows, follow the full TDD cycle below.

### Step 1: Guard Check

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

### Step 2: Load Plan

Read the active PLAN.md from the current phase directory.
Parse the tasks list and identify which steps are complete.

### Step 3: Define Behaviors

Spawn `@orchestrator` to generate behavior checklist from PLAN.md:
- Acceptance cases for each step
- Edge cases to test
- Expected behaviors

Store in TDD state.

### Step 4: Identify Next Step

From PLAN.md, find the first step NOT in `steps_complete`.
Check TDD stage — only proceed if stage is appropriate for the step.

### Step 5: Write Failing Tests (RED)

For `quick` / `docs-only` workflows: **SKIP this step.** Run existing tests after implementation in Step 8.

For all other workflows, spawn `@tester` to write tests for the step's behavior:
- **Tests MUST fail** before implementation
- Cover acceptance cases and edge cases
- Use AAA pattern (Arrange-Act-Assert)

### Step 6: Confirm RED

For `quick` / `docs-only` workflows: **SKIP this step.**

For all other workflows:
Run failing tests:
- **GUARD: Do NOT proceed to Step 7 until tests fail**
- If tests pass unexpectedly, tests don't correctly describe behavior

### Step 7: Implement Minimum (GREEN)

Spawn the implementation agent selected by scope (`@backend-coder`, `@frontend-coder`, or `@devops`) to implement:
- **Minimum code** to make failing tests pass
- No speculative features
- No over-engineering

### Step 8: Confirm GREEN

Run tests:
- **GUARD: Do NOT proceed to Step 9 until tests pass**
- If tests fail, return to Step 7

### Step 9: Refactor (REFACTOR)

For `quick` / `docs-only` workflows: **SKIP this step** unless the user explicitly requests cleanup.

For all other workflows, only if GREEN:
- Clean up code for this step
- Remove dead code
- Improve readability
- **GUARD: Do not refactor if not GREEN**

### Step 10: Verify

Run full test suite:
- All tests must pass
- If any fails, revert refactoring

### Step 11: Review Step

Spawn `@reviewer` to check:
- Code quality, security, conventions
- TDD discipline followed
- Test coverage >= 80%
- No missing or weak tests (flag as major finding)

### Step 12: Update State

Mark step complete via planning-state tool:
```yaml
steps_complete: [N, ...]
last_action: "Step N complete via TDD: [behavior]"
tdd:
  stage: behavior  # Ready for next step
```

After each step that changes source files, refresh the codegraph index so impact analysis stays current for subsequent steps:

```
codegraph action=refresh agent=fd-execute
```

If refresh fails, log a warning but do not block execution — codegraph auto-syncs via file watcher when the MCP server is running.

### Step 13: Loop or Complete

If more steps pending:
- Return to Step 3 (define behaviors for next step)

If all steps complete:
- Update phase status to "complete"
- Update ROADMAP.md progress
- Present completion summary

## Wave-Based Execution

WF-03 respects wave structure from PLAN.md:
- Wave 1 steps execute first (with TDD cycle per step)
- Wave 2 steps execute after Wave 1 completes
- Wave 3 steps execute after Wave 2 completes
- No intra-wave dependencies (parallel execution)

## Guards Summary

| Transition | Guard | If Violated |
|-----------|-------|-------------|
| behavior → red | Test written and fails | Block until test fails |
| red → green | Test exists and fails | Block until test passes |
| green → refactor | Tests are green | Block until green |
| refactor → verify | All tests pass | Block until all pass |

## Override Mechanism

User can override with `/fd-execute --override`:
- Every override is logged in `override_log`
- Surface override in next review
- Flag in deploy check

## Error Handling

D-03: Fail fast with clear error
- If guard check fails: abort with clear error and remediation
- If implementation agent fails: report failure, offer retry or skip
- If @reviewer finds critical issues: return to Step 7 for fixes
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
