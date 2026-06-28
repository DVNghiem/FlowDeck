---
description: Verify feature completion — run full test suite, reviewer, and deploy check against the current phase
argument-hint: [--phase=N] [--env=staging|production]
---

# Verify

Run the full verification pipeline for the current feature: tests, code review, and deploy check.

**Input:** $ARGUMENTS — optional `--phase=N` to target a specific phase, `--env` for deploy check environment

## Pre-flight

1. Check `.planning/STATE.md` exists — if not, error: "No active workspace. Run `/fd-map-codebase` to initialize, then `/fd-new-feature` to start a feature."
2. Read current phase N from STATE.md.
3. Confirm `steps_complete` in STATE.md is non-empty — if empty, warn: "No steps completed yet. Run /fd-execute first."

## Process

### Step 1: Gather Scope

Collect files changed in the current feature:
```bash
git diff --name-only HEAD
```

If no changed files, use all files in the current phase directory as scope.

**CodeGraph Impact Check (when available):**

```
codegraph action=check
```

If codegraph is installed and indexed:
- Use `codegraph_impact` on each changed file to surface any dependent modules not caught by `git diff`
- Log: "codegraph impact analysis: [N] dependent symbols detected"
- Expand review scope to include impacted modules flagged by codegraph

This ensures verification covers caller/callee relationships, not just directly-changed files.

### Step 2: Run Checks in Parallel

Launch all four checks simultaneously:

**Check A: Full Test Suite (@tester)**
```bash
npm test
```
All tests must pass. No failures, no unexplained skips.

**Check B: Code Review (@reviewer)**
Review all changed files:
- Security: secrets, injection vulnerabilities, auth gaps
- Quality: critical bugs, missing error handling, TDD discipline
- Conventions: naming, patterns, import style
- Test coverage >= 80% for changed files — flag as HIGH if below
- If task is UI-heavy, include design fidelity review against approved design artifact

**Check B2: UI Design Review (@design) — UI-heavy only**
- Compare implemented UI to approved design artifact
- Report hierarchy, spacing, CTA flow, responsiveness, accessibility, and missing state coverage gaps
- Fail verification when severe design fidelity mismatch exists

**Check C: Security Scan (@security-auditor)**
- No hardcoded secrets
- Input validation at trust boundaries
- Auth/authz on all protected routes
- No CRITICAL or HIGH vulnerabilities

**Check D: Deploy Check**
Run pre-deployment suite:
```bash
npm audit --audit-level=high
npm run build
```
No HIGH/CRITICAL CVEs. Build must succeed.

### Step 3: Aggregate Results

Present consolidated report:

```
════════════════════════════════════════════════════
VERIFICATION: Phase <N> — <feature name>
════════════════════════════════════════════════════

| Check         | Status           | Details              |
|---------------|------------------|----------------------|
| Tests         | ✅ PASS / ❌ FAIL | N/N passed           |
| Code Review   | ✅ PASS / ❌ FAIL | [findings summary]   |
| Security      | ✅ PASS / ❌ FAIL | [findings summary]   |
| CVE Audit     | ✅ PASS / ❌ FAIL | [vulnerabilities]    |
| Build         | ✅ PASS / ❌ FAIL | [errors]             |

────────────────────────────────────────────────────
Verdict: ✅ VERIFIED | ❌ NOT VERIFIED
════════════════════════════════════════════════════
```

### Step 4: Go / No-Go

**✅ VERIFIED** — all checks pass:
- Update STATE.md: set `status` to `verified`, `last_action` to `"Phase N verified"`
- Report next steps (deploy, increment phase, etc.)

**❌ NOT VERIFIED** — one or more checks failed:
```
Verdict: NOT VERIFIED

Required fixes:
- [ ] [fix 1]
- [ ] [fix 2]

Run /fd-verify again after fixing.
```
Do NOT update STATE.md to verified status.

## No-Go Conditions (automatic)

Any of these → automatic NOT VERIFIED:
- Test failures
- CRITICAL security vulnerability
- HIGH/CRITICAL CVE unpatched
- Build error
- Code review CRITICAL finding

## State Update on Success

```yaml
status: verified
last_action: "Phase N verified — all checks passed"
verified_at: "<timestamp>"
```

## Error Handling

- If `.planning/` not found: error "No active workspace. Run `/fd-map-codebase` to initialize, then `/fd-new-feature` to start a feature."
- If STATE.md not found: error "Project not initialized."
- If test runner not found: error with remediation (e.g., "No test script in package.json")
- No partial state update on error.

## Completion

Report: verification result, check statuses, any required fixes, and suggested next step.
Next step: run `/fd-done` or `/fd-fix-bug`.
