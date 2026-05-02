---
name: test-gap-detector
description: Identify which areas of a proposed change are weakly covered by tests and suggest the minimum high-value tests to add first.
origin: FlowDeck
---

# Test Gap Detector

Run `/test-gap` before implementing a feature or fix. Get back a ranked list of coverage gaps and the minimum viable tests to close them.

## Gap Categories

| Category | What It Means |
|----------|--------------|
| missing test file | Source file changed but no `*.test.*` counterpart exists |
| untested error path | A `catch`, `else`, or error branch has no test |
| untested branch | An `if/else` or `switch` arm has no test exercising it |
| no integration test | A service-to-service or API call has no integration test |
| no regression test | A previously-failed path has no regression test guarding it |

## Workflow

1. List all files to be changed
2. For each file, check if a test file exists (`*.test.ts`, `*.spec.ts`, `__tests__/`)
3. For files with tests, scan for untested branches:
   - Count `if`, `else`, `catch`, `switch` statements
   - Cross-reference with test file to see which paths are exercised
4. Check `.codebase/FAILURES.json` for prior failures on these paths — flag as regression gap if no regression test exists
5. For external calls (fetch, db.query, sendEmail), check for integration test coverage
6. Rank gaps by risk (auth > payment > data > logic > UI)
7. Produce minimum viable test set (top 3–5 tests)

## Output Format

```markdown
## Test Gap Report

### Gap Summary
| File | Gap Type | Risk | Suggested Test |
|------|----------|------|----------------|

### Minimum Viable Test Set (top 5)
1. **[test name]** — [file.test.ts]
   Tests: [what it validates]
   ```typescript
   it('[test name]', async () => {
     // test skeleton
   })
   ```

### Coverage Verdict: GOOD | GAPS FOUND | CRITICAL GAPS
```

## Guidance

- A test skeleton is always better than no test — write it even if incomplete
- Auth and payment paths with no regression test = CRITICAL GAP, block merge
- Do not add tests just to hit a coverage number — add tests for real risk paths
