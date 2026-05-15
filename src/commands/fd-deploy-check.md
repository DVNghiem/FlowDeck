---
description: Pre-deployment checks, code review, and pre-change analysis — all-in-one quality gate
argument-hint: [--env=staging|production] [--check=deploy,review,analysis] [--scope=path]
---

# Deploy Check

Run comprehensive checks before deployment or review code changes.

**Input:** $ARGUMENTS

## Check Types

### Deploy Check (`--check=deploy` or default)
Run full pre-deployment suite. See Steps 1-3 below.

### Code Review (`--check=review`)
Run parallel reviewer + researcher + tester on changed files. See Steps 4-6 below.

### Pre-Change Analysis (`--check=analysis`)
Run comprehensive pre-change analysis. See Step 7 below.

## Common Pre-flight

1. If `--scope` provided: use that path
2. If no scope with `--check=review`: use files changed since last commit
3. If no scope with `--check=deploy`: use all changed files since last commit

## Process

### Step 1: Parallel Checks

Launch four checks simultaneously:

**Check A: Test Suite (@tester)**
```bash
npm test
```
All tests must pass. No failures, no skips without justification.

**Check B: Security Scan**

Spawn `@security-auditor` to check:
- No hardcoded secrets in changed files
- Input validation at trust boundaries
- Auth/authz on all protected routes
- No CRITICAL or HIGH vulnerabilities

**Check C: Dependency CVE Audit**
```bash
npm audit --audit-level=high
```
No HIGH or CRITICAL CVEs unaddressed.

**Check D: Build Verification**
```bash
npm run build
```
Build must succeed with zero errors.

**Check E: Code Review (@reviewer)** — parallel with above
- Security review: secrets, injection vulnerabilities, auth gaps
- Quality review: critical bugs, missing error handling
- TDD discipline: verify new code has tests
- Report: CRITICAL/HIGH findings only (no nits for deploy check)

### Step 2: Aggregate Results

```
## Pre-Deployment Check

| Check | Status | Details |
|-------|--------|---------|
| Tests | ✅ PASS / ❌ FAIL | N/N passed |
| Security | ✅ PASS / ❌ FAIL | [findings] |
| CVE Audit | ✅ PASS / ❌ FAIL | [vulnerabilities] |
| Build | ✅ PASS / ❌ FAIL | [errors] |
```

### Step 3: Go/No-Go Decision

**🚀 GO** — all checks pass, proceed with deployment.

**🛑 NO-GO** — one or more checks failed:
```
Verdict: NO-GO

Required fixes before deploy:
- [ ] [fix 1]
- [ ] [fix 2]

Run /fd-deploy-check again after fixing.
```

## No-go conditions (automatic)

Any of these → automatic NO-GO:
- Test failures
- CRITICAL security vulnerability
- HIGH/CRITICAL CVE unpatched
- Build error

### Step 4: Code Review Scope (--check=review)

If `/fd-deploy-check --check=review [scope]` provided: review files matching scope.
If no scope: review all files changed since last commit.

```bash
git diff --name-only HEAD~1
```

If no changes found, report: "Nothing to review."

### Step 5: Parallel Review

Spawn three agents simultaneously:

**@reviewer**
- Security: secrets, injection, auth, XSS
- Quality: function size, nesting, error handling
- Conventions: naming, import style, patterns

**@researcher**
- Look up best practices for flagged patterns
- Check if flagged patterns are known vulnerabilities
- Provide context for MEDIUM findings

**@tester**
- Check coverage for changed files
- Identify untested paths
- Run existing tests

### Step 6: Aggregate Review Results

Merge all findings by severity:

```
## Code Review: <scope>

### 🔴 CRITICAL (block merge)
- [finding with file:line and fix]

### 🟠 HIGH (strongly recommend fix)
- [finding]

### 🟡 MEDIUM (consider fixing)
- [finding]

### 🟢 LOW (optional)
- [finding]

### Coverage
- Changed files: N%
- Untested paths: [list]

### Verdict: PASS | FAIL | PASS_WITH_NOTES
```

### Step 7: Pre-Change Analysis (--check=analysis)

Run all analyses in parallel:

1. **Impact Radar** — which files/APIs/tests are affected
2. **Blast Radius** — downstream consequences and hidden couplings
3. **Regression Predict** — most likely regression categories
4. **Test Gap** — coverage gaps to fill before implementing
5. **Volatility** — check hotspot scores on affected files
6. **Review Route** — who should review this change

## Consolidated Analysis Report

```
════════════════════════════════════════════════════
PRE-CHANGE ANALYSIS: "$ARGUMENTS"
════════════════════════════════════════════════════

IMPACT (<N> files affected)
  - <top 5 affected files with reason>

BLAST RADIUS (risk: <low|medium|high>)
  - <key downstream risks>

REGRESSIONS (top 3 risks)
  🔴 <category> — <reason>
  🟠 <category> — <reason>

TEST GAPS (<N> gaps found)
  - CRITICAL: <gap>
  - HIGH: <gap>

VOLATILITY
  Hot zones touched: <list or "none">

REVIEW ROUTING
  → <reviewer type> (<reason>)

────────────────────────────────────────────────────
RECOMMENDATION: <proceed | add tests first | redesign | review required>

Next steps:
  1. <most important action>
  2. <second action>
════════════════════════════════════════════════════
```

## Severity Classification

| Severity | Meaning | Action |
|----------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |
