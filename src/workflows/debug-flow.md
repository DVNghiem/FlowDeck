---
name: debug-flow
description: "Systematic debugging: reproduce → trace → write failing test → fix root cause → verify. Never suppress errors."
triggers:
  - /debug
steps:
  - name: reproduce
    agent: "@debug-specialist"
    action: Establish minimal reproduction case with expected vs actual behavior
  - name: trace
    agent: "@debug-specialist"
    action: Debug-specialist traces execution path and identifies root cause
  - name: write_test
    agent: "@tester"
    action: Tester writes failing regression test for the exact failure
  - name: fix
    agent: "@coder"
    action: Coder fixes root cause with minimal change
  - name: verify
    agent: "@tester"
    action: Run regression test + full suite to confirm fix
---

# Debug Flow

## Purpose

Diagnose and fix unexpected behavior systematically. Prevents symptom-fixing and ensures reproducibility.

## Rules

- Never suppress an error to make a test pass
- Fix the root cause, not the symptom
- Always write a regression test before fixing
- Read stack traces completely — never half-read

## Process

### Step 1: Reproduce

Document the bug precisely:
```
Bug: [one-line description]
Steps to reproduce:
  1. ...
  2. ...
Expected: [what should happen]
Actual: [what does happen]
Stack trace: [if available]
```

Confirm you can reproduce it consistently before proceeding.

### Step 2: Trace

Spawn `@debug-specialist` to:

1. Read the complete stack trace
2. Identify the failing function and line
3. Trace inputs backward to find where bad data enters
4. Check recent changes: `git log --oneline -10 -- <file>`
5. Identify root cause (not symptom)

Common root causes:
| Symptom | Look for |
|---------|---------|
| null/undefined error | Missing boundary check |
| Wrong value | Type coercion, missing validation |
| Race condition | Missing await, shared mutable state |
| Auth failure | Missing middleware, wrong scope check |
| Infinite loop | Missing base case, wrong termination |

### Step 3: Write Failing Test

Spawn `@tester` to write a regression test:
- Must FAIL on current code (RED)
- Tests the exact scenario from Step 1
- Isolated from other tests

```typescript
test('should [expected] when [condition from bug report]', () => {
  // Arrange: set up the exact failing scenario
  // Act: call the failing code
  // Assert: verify expected behavior
});
```

### Step 4: Fix

Spawn `@coder` to:
- Fix the root cause identified in Step 2
- Minimum change to make the regression test pass
- Do NOT touch unrelated code

If the fix requires more than 20 lines: STOP, reassess scope.

### Step 5: Verify

```bash
# Regression test must pass
npm test -- --grep "regression test name"

# Full suite must still pass
npm test
```

If any unrelated test breaks: the fix has unintended side effects. Investigate before proceeding.

## Output

```
## Debug Complete

Bug: [description]
Root cause: [specific cause]
Fix: [what changed, file:line]
Regression test: [test name] ✅ PASS
Suite: ✅ N/N tests passing
```
