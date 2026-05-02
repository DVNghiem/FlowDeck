---
name: deploy-check-flow
description: "Pre-deployment checks: parallel tests + security scan + CVE audit + build verification → go/no-go decision"
triggers:
  - /deploy-check
steps:
  - name: parallel_checks
    agent: "@parallel-coordinator"
    action: Run tests, security scan, CVE audit, and build in parallel
  - name: aggregate
    agent: "@orchestrator"
    action: Aggregate all results into a unified report
  - name: decision
    agent: "@orchestrator"
    action: Produce explicit go/no-go decision with required fixes if no-go
---

# Deploy Check Flow

## Purpose

Run a comprehensive pre-deployment check suite before releasing to production.

## Process

### Step 1: Parallel Checks

Launch four checks simultaneously:

**Check A: Test Suite**
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

### Step 3: Decision

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

## Agent configuration

| Agent | Purpose |
|-------|---------|
| @tester | Run test suite |
| @security-auditor | Security vulnerability scan |
| @researcher | CVE research and context |
