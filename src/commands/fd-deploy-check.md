---
description: Parallel tester + reviewer + researcher CVE check — orchestrator go/no-go deploy decision
argument-hint: [--env=staging|production]
---

# Deploy Check

Run a comprehensive pre-deploy validation to produce a go/no-go decision.

**Input:** $ARGUMENTS — optional `--env=staging|production` (default: staging)

## Parallel Checks

Run three checks simultaneously:

### Check 1 — Test Suite (@tester)
- Run full test suite
- Check TDD coverage meets threshold (default: 80%)
- Report: tests passed/failed, coverage %, any flaky tests

### Check 2 — Code Review (@reviewer)
- Security review: secrets, injection vulnerabilities, auth gaps
- Quality review: critical bugs, missing error handling
- TDD discipline: verify new code has tests
- Report: CRITICAL/HIGH findings only (no nits for deploy check)

### Check 3 — CVE Scan (@researcher)
- Scan `package.json`, `go.mod`, `Cargo.toml`, `requirements.txt` for known CVEs
- Check for recently disclosed vulnerabilities in key dependencies
- Report: any HIGH or CRITICAL CVEs found

## Go/No-Go Decision

**@orchestrator** aggregates results:

| Condition | Decision |
|-----------|----------|
| All checks pass, zero CRITICAL/HIGH | ✅ GO |
| Test failures or coverage below threshold | ❌ NO-GO |
| CRITICAL security issues | ❌ NO-GO |
| HIGH issues or HIGH CVEs | ⚠️ CONDITIONAL (requires override) |

## Report

```
════════════════════════════════════════════
DEPLOY CHECK — <env>
════════════════════════════════════════════
Tests:    <passed>/<total> | Coverage: <X>%
Security: <N> critical, <M> high
CVEs:     <N> high, <M> medium

DECISION: GO / NO-GO / CONDITIONAL
════════════════════════════════════════════
```

For NO-GO: list blocking issues with fix suggestions.
For CONDITIONAL: list what requires override approval.
