---
description: Parallel tester + reviewer + researcher CVE check — orchestrator go/no-go deploy decision
argument-hint: [--env=staging|production]
---

# Deploy Check

Run a comprehensive pre-deployment check suite before releasing to production.

**Input:** $ARGUMENTS — optional `--env=staging|production` (default: staging)

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

Run /deploy-check again after fixing.
```

## No-go conditions (automatic)

Any of these → automatic NO-GO:
- Test failures
- CRITICAL security vulnerability
- HIGH/CRITICAL CVE unpatched
- Build error

## Agent Configuration

| Agent | Purpose |
|-------|---------|
| @tester | Run test suite |
| @security-auditor | Security vulnerability scan |
| @researcher | CVE research and context |
| @reviewer | Code quality review |
