# /fd-deploy-check

**Purpose:** Pre-deploy safety check with test, security, and build verification.

## Usage

/fd-deploy-check [--env=staging|production] [--check=deploy,review,analysis] [--scope=path]

## Arguments

- `--env=staging|production` (optional) — target environment
- `--check=deploy|review|analysis` (optional) — type of check to run
  - `deploy` (default): full pre-deployment suite
  - `review`: parallel reviewer + researcher + tester on changed files
  - `analysis`: comprehensive pre-change analysis
- `--scope=path` (optional) — limit scope to specific files or directories

## What Happens

### Deploy Check (`--check=deploy` or default)

**Step 1: Parallel Checks**

Launch four checks simultaneously:

- **Check A: Test Suite (@tester)** — runs `npm test`. All tests must pass.
- **Check B: Security Scan (@security-auditor)** — checks for hardcoded secrets, input validation at trust boundaries, auth/authz on protected routes, no CRITICAL/HIGH vulnerabilities.
- **Check C: Dependency CVE Audit** — runs `npm audit --audit-level=high`. No HIGH/CRITICAL CVEs unaddressed.
- **Check D: Build Verification** — runs `npm run build`. Build must succeed with zero errors.
- **Check E: Code Review (@reviewer)** (parallel) — security review, quality review, TDD discipline check.

**Step 2: Aggregate Results**

```
## Pre-Deployment Check

| Check | Status | Details |
|-------|--------|---------|
| Tests | ✅ PASS / ❌ FAIL | N/N passed |
| Security | ✅ PASS / ❌ FAIL | [findings] |
| CVE Audit | ✅ PASS / ❌ FAIL | [vulnerabilities] |
| Build | ✅ PASS / ❌ FAIL | [errors] |
```

**Step 3: Go/No-Go Decision**

- **🚀 GO** — all checks pass, proceed with deployment.
- **🛑 NO-GO** — one or more checks failed. Report required fixes.

### Code Review (`--check=review`)

**Step 4-5: Scope and Parallel Review**

Determine scope (files changed since last commit or provided scope). Spawn three agents in parallel:
- **@reviewer** — security, quality, conventions review
- **@researcher** — best practices lookup, vulnerability context
- **@tester** — coverage check, untested paths, run existing tests

**Step 6: Aggregate Review Results**

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

### Pre-Change Analysis (`--check=analysis`)

**Step 7: Run All Analyses in Parallel**

1. **Impact Radar** — which files/APIs/tests are affected
2. **Blast Radius** — downstream consequences and hidden couplings
3. **Regression Predict** — most likely regression categories
4. **Test Gap** — coverage gaps to fill before implementing
5. **Review Route** — who should review this change

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

REVIEW ROUTING
  → <reviewer type> (<reason>)

────────────────────────────────────────────────────
RECOMMENDATION: <proceed | add tests first | redesign | review required>

Next steps:
  1. <most important action>
  2. <second action>
════════════════════════════════════════════════════
```

## No-Go Conditions

Automatic NO-GO if any of:
- Test failures
- CRITICAL security vulnerability
- HIGH/CRITICAL CVE unpatched
- Build error

## Output / State

For deploy: aggregated check results with GO/NO-GO verdict.
For review: findings by severity with verdict.
For analysis: consolidated analysis report with recommendations.

## Examples

**Full pre-deployment check:**
```
/fd-deploy-check
```

**Code review on specific scope:**
```
/fd-deploy-check --check=review --scope=src/auth
```

**Pre-change analysis:**
```
/fd-deploy-check --check=analysis --scope=src/api
```

**Target staging environment:**
```
/fd-deploy-check --env=staging
```

## Related Commands

- `/fd-verify` — full verification suite
- `/fd-fix-bug` — fix issues found during check
- `/fd-status` — review current project state