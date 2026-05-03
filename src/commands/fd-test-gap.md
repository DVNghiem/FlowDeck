---
description: Test Gap Detector — identify areas of a proposed change weakly covered by tests and suggest minimum high-value tests to add
argument-hint: [change description or file paths]
---

# Test Gap

Identify test gaps in a proposed change and recommend the minimum high-value tests to add.

**Input:** $ARGUMENTS — description of the change or specific file paths

## Steps

Run two agents in parallel:

- **@tester**: Find source files mentioned in `$ARGUMENTS` that have no corresponding test file; identify branches/edge cases in changed functions with no test coverage; look for missing error-path tests

- **@researcher**: Check if the changed functions appear in any integration or end-to-end test; find prior test gaps in this area from git history (tests added reactively after bugs)

## Gap Scoring

For each identified gap:
- **CRITICAL**: public API with no test at all
- **HIGH**: error handling path with no test
- **MEDIUM**: business logic branch not covered
- **LOW**: edge case (empty input, max values) not tested

## Report

```
════════════════════════════════════════════
TEST GAP REPORT
════════════════════════════════════════════
Change: <summary>

Gaps Found (<N>):

  CRITICAL: <file> — no test file exists
    Suggest: <test file path> testing <what>

  HIGH: <function> in <file> — error path not tested
    Suggest: test case for <error condition>

  MEDIUM: <function> — branch "<condition>" not covered
    Suggest: test case where <condition is true>

────────────────────────────────────────────
Minimum Tests to Add (prioritized):
  1. <test description> — covers CRITICAL gap
  2. <test description> — covers HIGH gap
════════════════════════════════════════════
```

Ask: "Should I write these tests now?"
