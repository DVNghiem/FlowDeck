---
description: Parallel reviewer + researcher + tester — aggregates findings into critical/major/minor report
argument-hint: [--scope=path | --focus=security,quality,tdd]
---

# Review Code

Run a comprehensive parallel code review.

**Input:** $ARGUMENTS — optional `--scope=<path>` and `--focus=<areas>`

## Steps

1. Determine scope: use `--scope` if provided, else review uncommitted changes (`git diff --name-only HEAD`).
2. If no changes found, report: "Nothing to review."

## Parallel Review

Run three reviewers in parallel:

- **@reviewer**: Quality, security, convention compliance, TDD discipline
  - CRITICAL: hardcoded secrets, SQL injection, XSS, auth gaps
  - HIGH: logic errors, missing error handling, unsafe casts
  - MEDIUM: functions >50 lines, nesting >4 deep, missing tests
  - LOW: naming nits, missing comments on public APIs

- **@researcher**: API contracts, edge cases, hidden dependencies, integration risks

- **@tester**: Test coverage, missing test cases, test quality, regression risks

## Report

Aggregate findings into:

```
════════════════════════════════════════════
CODE REVIEW REPORT
════════════════════════════════════════════
Files reviewed: <N>

CRITICAL (<count>)
  - <file>:<line> — <issue>

HIGH (<count>)
  - <file>:<line> — <issue>

MEDIUM (<count>)
  - <file>:<line> — <issue>

LOW (<count>)
  - <file>:<line> — <issue>

Test Coverage: <findings>
────────────────────────────────────────────
Verdict: PASS / NEEDS CHANGES / BLOCK
════════════════════════════════════════════
```

**Verdict rules:**
- CRITICAL issues → BLOCK
- HIGH issues → NEEDS CHANGES
- Only MEDIUM/LOW → PASS with comments
