---
description: Change Impact Radar — predict which files, modules, APIs, tests, and DB paths are affected before editing anything
argument-hint: [change description]
---

# Impact Radar

Predict the blast area of a proposed change before any code is written.

**Input:** $ARGUMENTS — description of the proposed change

## Steps

Run three agents in parallel:

- **@researcher**: Trace dependency graph from the paths mentioned in `$ARGUMENTS`; find all files that import or are imported by those modules; map 2 levels deep

- **@architect**: Identify API contracts and service boundaries at risk; flag any public interfaces that would change; check for DB schema impacts

- **@tester**: Find test files that cover the affected paths; identify which tests would need updating; spot gaps (changed files with no tests)

## Report

```
════════════════════════════════════════════
CHANGE IMPACT RADAR
════════════════════════════════════════════
Change: <summary of $ARGUMENTS>
Risk score: <low|medium|high>

Affected Files (<N>):
  - <file> (<reason>)

API Contracts at Risk:
  - <interface/endpoint> — <risk>

Tests to Update (<N>):
  - <test file>

Test Gaps (<N> files with no tests):
  - <file>

DB / Schema Impact:
  - <none | description>

Recommendation:
  <proceed with caution | review required | block>
════════════════════════════════════════════
```

If no impact found: "No significant impact detected. Proceed with standard review."
