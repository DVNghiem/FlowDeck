---
name: fix-bug-flow
description: "TDD-enforced bug fix: reproduce → isolate → RED (failing regression test) → GREEN (minimum fix) → REFACTOR → verify"
triggers:
  - /fix-bug
steps:
  - name: load_context
    agent: "@orchestrator"
    action: Read STATE.md, ARCHITECTURE.md, CONVENTIONS.md; Initialize TDD state (stage=behavior)
  - name: define_behaviors
    agent: "@orchestrator"
    action: "Generate behavior checklist: what behaviors does this bug break? List acceptance cases."
  - name: reproduce
    agent: "@debug-specialist"
    action: Reproduce the bug with minimal case; document inputs and expected vs actual
  - name: isolate
    agent: "@researcher"
    action: Researcher investigates root cause; traces stack, reads related code
  - name: write_failing_test
    agent: "@tester"
    action: "TDD RED: Write a failing regression test that reproduces the bug. Test MUST fail before proceeding."
  - name: confirm_red
    agent: "@tester"
    action: "Run failing test — confirm it fails for the expected reason. Record RED state. Do NOT proceed until test fails."
  - name: implement_fix
    agent: "@coder"
    action: "TDD GREEN: Implement minimum code change to make the failing test pass. No over-engineering."
  - name: confirm_green
    agent: "@tester"
    action: "Run regression test — confirm it passes. Record GREEN state. Do NOT proceed until test passes."
  - name: refactor
    agent: "@coder"
    action: "TDD REFACTOR: Clean up implementation while preserving passing tests. Only if tests are GREEN."
  - name: verify_refactor
    agent: "@tester"
    action: "Run full test suite — confirm all tests pass after refactoring."
  - name: review
    agent: "@reviewer"
    action: "Reviewer checks: fix is correct, no regressions, TDD discipline followed, no missing tests."
  - name: update_state
    agent: "@orchestrator"
    action: "Update STATE.md: record bug, fix, test name, TDD stage=complete, regression test link"
---

# Fix Bug Flow (TDD-Enforced)

## Purpose

Fix a reported bug following strict Red-Green-Refactor TDD cycle with mandatory regression test.

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

## Step Definitions

### Step 1: Load Context

Read:
- `.planning/STATE.md` — current phase, TDD state
- `.codebase/ARCHITECTURE.md` — system structure
- `.codebase/CONVENTIONS.md` — coding standards

Initialize TDD state:
```yaml
tdd:
  stage: behavior
  cycle: 1
  behaviors: []
  regression_test_links: []
```

### Step 2: Define Behaviors

Spawn `@orchestrator` to generate a behavior checklist:
- What behaviors does this bug break?
- What are the acceptance cases for "fixed"?
- What edge cases should be tested?

Store behaviors in TDD state.

### Step 3: Reproduce

Identify minimal reproduction:
- What inputs trigger the bug?
- What is expected behavior?
- What is actual behavior?

Document in comment or issue before touching code.

### Step 4: Isolate Root Cause

Spawn `@researcher` to investigate:
- Trace the execution path
- Read stack trace completely
- Check recent changes: `git log --oneline -20 -- <file>`
- Identify root cause (not symptom)

### Step 5: Write Failing Test (RED)

Spawn `@tester` to write regression test:
- **Test MUST fail on current code** (this is the RED phase)
- Named: `test('should <expected> when <condition>')`
- Tests the bug scenario exactly
- Use AAA pattern (Arrange-Act-Assert)

### Step 6: Confirm RED

Run the failing test:
- Confirm it fails for the expected reason
- **GUARD: Do NOT proceed to Step 7 until test fails**
- If test passes unexpectedly, the test is not correctly reproducing the bug

### Step 7: Implement Fix (GREEN)

Spawn `@coder` to implement fix:
- Fix the root cause identified in Step 4
- **Minimum code change** that makes regression test pass
- Do NOT add unrelated functionality
- Do NOT over-engineer

### Step 8: Confirm GREEN

Run regression test:
- **GUARD: Do NOT proceed to Step 9 until test passes**
- If test fails, the fix is incomplete — return to Step 7

### Step 9: Refactor (REFACTOR)

Only if tests are GREEN:
- Clean up implementation
- Remove dead code introduced during green phase
- Improve readability without changing behavior
- **GUARD: Do not refactor if tests are not green**

### Step 10: Verify Refactor

Run full test suite:
- All tests must pass
- If any test fails, revert refactoring and return to Step 9

### Step 11: Review

Spawn `@reviewer` to check:
- Fix is correct and complete
- No regressions introduced
- TDD discipline followed (RED before GREEN, minimum impl)
- Missing tests are flagged as major findings
- No suspicious test omissions

### Step 12: Update State

Update STATE.md:
- Record bug description and root cause
- Record fix applied (file:line)
- Record regression test name and path
- Update TDD stage to "complete"
- Update `last_action` to "Bug fixed: [description]"

## Error Handling

- **GUARD VIOLATION**: If coder attempts to skip RED or GREEN phase, block and return to correct phase
- **Override mechanism**: User can override with `/fd-fix-bug --override` but every override is logged in `override_log`
- If root cause unclear: spawn `@debug-specialist` for deeper analysis
- If fix breaks tests: revert, reassess root cause, never suppress error

## Override Protocol

If user requests bypass of TDD stages:
1. Log the override: `logTDDOverride(dir, stage, reason, override_by="user")`
2. Surface override in next review check
3. Flag in deploy check as "TDD override used"

## Output

```
## Bug Fix Complete (TDD-Enforced)

**Bug:** [description]
**Root cause:** [what caused it]
**Behaviors tested:** [N behaviors]
**TDD Stage:** complete
**Cycle:** [N cycles used]

**Regression test:** [test name] @ [path]
**Test result:** ✅ PASS

**Override used:** [yes/no]
```

## Guards Summary

| Transition | Guard | If Violated |
|-----------|-------|-------------|
| behavior → red | Test written and fails | Block until test fails |
| red → green | Test exists and fails | Block until test passes |
| green → refactor | Tests are green | Block until green |
| refactor → complete | All tests pass | Block until all pass |
