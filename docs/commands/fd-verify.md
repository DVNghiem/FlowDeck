# /fd-verify

**Purpose:** Full verification pipeline after feature implementation — runs tests, code review, security scan, and deploy check; updates STATE.md to `verified` on full pass.

## Usage

/fd-verify [--phase=N] [--env=staging|production]

## What Happens

1. **Pre-flight checks.**
   - Verify `.planning/` and STATE.md exist
   - Read current phase N from STATE.md
   - Warn if `steps_complete` is empty (no steps executed yet)

2. **Gather scope.**
   - Collect changed files via `git diff --name-only HEAD`
   - If no changes, use all files in the current phase directory
   - Run `codegraph action=check` — if available, use `codegraph_impact` on changed files to surface dependent modules not caught by `git diff`

3. **Run four checks in parallel:**

   - **Tests (@tester):** `npm test` — all tests must pass, no failures or unexplained skips
   
   - **Code Review (@reviewer):** Review all changed files — security (secrets, injection, auth gaps), quality (critical bugs, error handling, TDD discipline), conventions (naming, patterns, import style), >= 80% test coverage for changed files. If UI-heavy: design fidelity review against approved design artifact
   
   - **UI Design Review (@design):** If UI-heavy — compare implemented UI to approved design artifact, report on hierarchy, spacing, CTA flow, responsiveness, accessibility, and missing state coverage. Fail verification on severe design fidelity mismatch
   
   - **Security Scan (@security-auditor):** No hardcoded secrets, input validation at trust boundaries, auth/authz on all protected routes, no CRITICAL/HIGH vulnerabilities
   
   - **Deploy Check:** `npm audit --audit-level=high` and `npm run build` — no HIGH/CRITICAL CVEs, build must succeed

4. **Aggregate results.** Present consolidated table with pass/fail status for each check.

5. **Go/No-Go decision.**

   **VERIFIED (all checks pass):**
   - Update STATE.md: `status: verified`, `last_action: "Phase N verified — all checks passed"`, `verified_at: <timestamp>`
   - Report next steps (deploy, increment phase, etc.)

   **NOT VERIFIED (one or more checks fail):**
   - List required fixes
   - Do NOT update STATE.md to verified status
   - Report suggested next step (run `/fd-execute` for fixes, then `/fd-verify` again)

6. **No-Go conditions (automatic NOT VERIFIED):** test failures, CRITICAL security vulnerability, unpatched HIGH/CRITICAL CVE, build error, CRITICAL code review finding.

## Output / State

STATE.md on verified:
```yaml
status: verified
last_action: "Phase N verified — all checks passed"
verified_at: "<timestamp>"
```

## Examples

```
/fd-verify
```

Run full verification pipeline for the current phase.

```
/fd-verify --phase=2 --env=staging
```

Verify phase 2 and run deploy check against staging environment.

## Related Commands

- `/fd-execute` — implement the feature before verification
- `/fd-plan` — create the plan that was verified against
- `/fd-resume` — reload state after making fixes
