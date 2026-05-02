---
name: review-code-flow
description: "Parallel code review workflow: security + quality + convention checks with CRITICAL/HIGH/MEDIUM/LOW severity classification"
triggers:
  - /review-code
steps:
  - name: identify_scope
    agent: "@orchestrator"
    action: Determine files to review (changed files, or explicit scope argument)
  - name: parallel_review
    agent: "@parallel-coordinator"
    action: Spawn @reviewer, @researcher, @tester in parallel
  - name: security_check
    agent: "@reviewer"
    action: Reviewer checks for vulnerabilities (injection, secrets, auth)
  - name: quality_check
    agent: "@reviewer"
    action: Reviewer checks code quality and convention adherence
  - name: context_check
    agent: "@researcher"
    action: Researcher provides best-practice context for flagged areas
  - name: test_check
    agent: "@tester"
    action: Tester verifies test coverage for changed code
  - name: aggregate
    agent: "@orchestrator"
    action: Aggregate findings by severity, present unified report
---

# Review Code Flow

## Purpose

Run a thorough parallel code review before merging or deploying.

## Process

### Step 1: Identify Scope

If `/review-code [scope]` provided: review files matching scope.
If no scope: review all files changed since last commit.

```bash
git diff --name-only HEAD~1
```

### Step 2: Parallel Review

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

### Step 3: Aggregate Results

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

### Step 4: Decision

- **CRITICAL found** → Block. Fix before merge.
- **HIGH found** → Strongly recommend fix. Document if proceeding anyway.
- **MEDIUM/LOW** → Document. Proceed.
- **PASS** → Ready to merge.

## Agent configuration

| Agent | Model | Purpose |
|-------|-------|---------|
| @reviewer | google/gemini-2.5-flash | Security and quality |
| @researcher | anthropic/claude-sonnet-4-5 | Context and best practices |
| @tester | anthropic/claude-sonnet-4-5 | Coverage analysis |
