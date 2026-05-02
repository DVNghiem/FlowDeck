---
name: execute-flow
description: "TDD-enforced feature execution: behavior checklist → RED (failing tests) → GREEN (minimum impl) → REFACTOR → review"
triggers:
  - /new-feature
steps:
  - name: guard_check
    agent: "@orchestrator"
    priority: first
    action: Verify .planning/ and .codebase/ exist, plan is confirmed; Initialize TDD state (stage=behavior)
  - name: load_plan
    agent: "@orchestrator"
    action: Read active PLAN.md from current phase directory
  - name: define_behaviors
    agent: "@orchestrator"
    action: "Generate behavior checklist from PLAN.md: list all acceptance cases, edge cases, and expected behaviors"
  - name: identify_next_step
    agent: "@orchestrator"
    action: Find first incomplete step (not in steps_complete); Check TDD stage for that step
  - name: write_behavior_tests
    agent: "@tester"
    action: "TDD RED: Write failing tests for the behavior. Tests MUST fail before implementation."
  - name: confirm_red
    agent: "@tester"
    action: "Run failing tests — confirm they fail for expected reasons. Do NOT proceed until tests fail."
  - name: implement_minimum
    agent: "@coder"
    action: "TDD GREEN: Implement minimum code to make failing tests pass. No speculative features."
  - name: confirm_green
    agent: "@tester"
    action: "Run tests — confirm they pass. Do NOT proceed until tests pass."
  - name: refactor_step
    agent: "@coder"
    action: "TDD REFACTOR: Clean up code for this step while preserving passing tests. Only if GREEN."
  - name: verify_step
    agent: "@tester"
    action: "Run full test suite for this step. Confirm all pass after refactoring."
  - name: review_step
    agent: "@reviewer"
    action: "Run @reviewer on completed step work; Check TDD discipline, test coverage, no test omissions"
  - name: update_state
    agent: "@orchestrator"
    action: "Mark step complete via planning-state tool; Update TDD stage"
  - name: loop_or_complete
    agent: "@orchestrator"
    action: "If more steps, return to identify_next_step; If all done, update phase status to complete"
---

# Execute Flow (TDD-Enforced)

## Purpose

Orchestrates execution of a confirmed PLAN.md following strict Red-Green-Refactor TDD cycle.

## Prerequisites

Before executing, verify:
1. `.planning/` exists (project initialized)
2. `.codebase/` exists (codebase mapped)
3. `PLAN.md` is confirmed (via /plan phase)

If any prerequisite fails, abort with clear error.

## TDD Cycle Per Step

Each plan step follows the TDD cycle:

```
BEHAVIOR → RED → GREEN → REFACTOR → next step
   ↑_________|        |
   (loop if needed)  Only if GREEN
```

## Step Definitions

### Step 1: Guard Check

Verify prerequisites:
- `.planning/` directory exists
- `.codebase/` directory exists
- `STATE.md` has `plan_confirmed: true`
- `PLAN.md` exists in current phase directory

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

Spawn `@tester` to write tests for the step's behavior:
- **Tests MUST fail** before implementation
- Cover acceptance cases and edge cases
- Use AAA pattern (Arrange-Act-Assert)

### Step 6: Confirm RED

Run failing tests:
- **GUARD: Do NOT proceed to Step 7 until tests fail**
- If tests pass unexpectedly, tests don't correctly describe behavior

### Step 7: Implement Minimum (GREEN)

Spawn `@coder` to implement:
- **Minimum code** to make failing tests pass
- No speculative features
- No over-engineering

### Step 8: Confirm GREEN

Run tests:
- **GUARD: Do NOT proceed to Step 9 until tests pass**
- If tests fail, return to Step 7

### Step 9: Refactor (REFACTOR)

Only if GREEN:
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

User can override with `/fd-new-feature --override`:
- Every override is logged in `override_log`
- Surface override in next review
- Flag in deploy check

## Error Handling

D-03: Fail fast with clear error
- If guard check fails: abort with clear error and remediation
- If @coder fails: report failure, offer retry or skip
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
