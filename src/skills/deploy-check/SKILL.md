---
name: deploy-check
description: Pre-deployment checklist covering tests, security scan, CVE audit, and code review. Returns a go/no-go decision. Use before every production deployment.
origin: FlowDeck
---

# Deploy Check Skill

Systematic pre-deployment verification. Returns GO or NO-GO with specific blockers.

## When to Activate

Activate before any production deployment or release.

## Core Principles

- Every check must pass before GO
- Any CRITICAL or HIGH finding = NO-GO
- No exceptions without explicit documented approval

## Workflow

1. Run test suite — all tests must pass
2. Run security scan — check for OWASP Top 10 issues
3. Run CVE audit — `npm audit --audit-level=moderate`
4. Run code review — check recent changes for quality issues
5. Check conventional commits — verify commit messages are valid
6. Validate environment variables — confirm all required vars are set
7. Aggregate findings — determine GO or NO-GO

## Checklist

### Tests
- [ ] `npm test` exits with code 0
- [ ] Coverage ≥ 80% (or project threshold)
- [ ] No skipped or pending tests (without documented reason)

### Security Scan
- [ ] No hardcoded credentials (grep for common patterns)
- [ ] No SQL string concatenation
- [ ] Auth middleware on all protected routes
- [ ] Input validation at all API boundaries
- [ ] No sensitive data in logs

### CVE Audit
```bash
npm audit --audit-level=moderate
```
- [ ] Zero critical vulnerabilities
- [ ] Zero high vulnerabilities (or documented exceptions)

### Code Review
- [ ] No CRITICAL or HIGH severity findings
- [ ] No TODO/FIXME in changed files (unless pre-existing)
- [ ] Error handling present on all new code paths

### Conventional Commits
- [ ] All commits since last release follow `type(scope): description` format
- [ ] Valid types: feat, fix, refactor, docs, test, chore, perf, ci
- [ ] Breaking changes marked with `!` or `BREAKING CHANGE:` footer

### Environment Variables
- [ ] All required env vars documented in `.env.example`
- [ ] No `.env` file committed to git
- [ ] Production environment has all required vars set
- [ ] No dev/test values used in production config

## Output Format

```markdown
## Deploy Check Report

### Verdict: GO ✅ | NO-GO ❌

### Blockers (if NO-GO)
- [specific issue that must be fixed]

### Warnings (GO with notes)
- [non-blocking issues to track]

### Passing
- ✅ Tests: 127 passing, 0 failing
- ✅ Security: no CRITICAL or HIGH findings
- ✅ CVE audit: 0 vulnerabilities
- ✅ Conventional commits: valid
- ✅ Environment variables: all present
```
