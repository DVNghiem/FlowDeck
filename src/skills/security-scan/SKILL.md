---
name: security-scan
description: Pre-commit security scan covering secrets, injection, auth, CVE dependencies. Returns PASS/FAIL verdict with severity-ranked findings and specific remediations.
origin: FlowDeck
---

# Security Scan Skill

Catches security issues before they reach production. Returns a severity-ranked report with specific remediations.

## When to Activate

Activate:
- Before merging any PR that touches auth, data access, or API routes
- Before every production deployment
- When adding new dependencies
- When changing environment variable handling

## Core Principles

- Security takes priority over convenience
- Every finding includes a specific remediation
- CRITICAL or HIGH = must fix before merge
- No exceptions without documented risk acceptance

## Workflow

1. Check for hardcoded secrets (grep patterns)
2. Check for injection vulnerabilities (SQL, command, template)
3. Verify auth middleware on protected routes
4. Check input validation at API boundaries
5. Run `npm audit --audit-level=moderate`
6. Review sensitive data in logs
7. Produce verdict

## OWASP Top 10 Quick Reference

| ID | Name | Check For |
|----|------|-----------|
| A01 | Broken Access Control | Missing auth checks, IDOR, privilege escalation |
| A02 | Cryptographic Failures | HTTP for sensitive data, MD5/SHA1 for passwords |
| A03 | Injection | SQL/NoSQL/cmd/template injection via string concat |
| A04 | Insecure Design | Missing rate limiting, no lockout after failed logins |
| A05 | Security Misconfiguration | Debug mode in prod, default credentials, verbose errors |
| A06 | Vulnerable Components | CVEs in dependencies (run npm audit) |
| A07 | Auth Failures | Missing middleware, weak JWT, no session invalidation |
| A08 | Integrity Failures | Missing input validation, unsafe deserialization |
| A09 | Logging Failures | Passwords/tokens in logs, insufficient logging |
| A10 | SSRF | User-controlled URLs fetched by server without validation |

## Scan Commands

```bash
# Dependency vulnerabilities
npm audit --audit-level=moderate

# Hardcoded secrets (grep patterns)
grep -r "password\s*=\s*['\"]" src/ --include="*.ts"
grep -r "api_key\s*=\s*['\"]" src/ --include="*.ts"
grep -r "secret\s*=\s*['\"]" src/ --include="*.ts"

# SQL string concatenation
grep -r "query\`.*\${" src/ --include="*.ts"
grep -rn "query.*+.*req\." src/ --include="*.ts"
```

## Output Format

```markdown
## Security Scan Report

### 🔴 Critical
| # | File | Line | Issue | Remediation |
|---|------|------|-------|-------------|

### 🟠 High
| # | File | Line | Issue | Remediation |
|---|------|------|-------|-------------|

### 🟡 Medium
| # | File | Line | Issue | Remediation |
|---|------|------|-------|-------------|

### Dependencies
- npm audit: 0 critical, 0 high, 2 moderate (tracked)

### Verdict: PASS ✅ | FAIL ❌ | PASS_WITH_NOTES ⚠️

FAIL if any Critical or High findings.
PASS_WITH_NOTES if only Medium or Low findings.
```
