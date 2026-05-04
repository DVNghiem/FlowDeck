---
description: Parallel reviewer + researcher + tester — aggregates findings into critical/major/minor report
argument-hint: [--scope=path | --focus=security,quality,tdd]
---

# Review Code

Run a comprehensive parallel code review before merging or deploying.

**Input:** $ARGUMENTS — optional `--scope=<path>` and `--focus=<areas>`

## Process

### Step 1: Identify Scope

If `/review-code [scope]` provided: review files matching scope.
If no scope: review all files changed since last commit.

```bash
git diff --name-only HEAD~1
```

If no changes found, report: "Nothing to review."

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

## Agent Configuration

| Agent | Model | Purpose |
|-------|-------|---------|
| @reviewer | google/gemini-2.5-flash | Security and quality |
| @researcher | anthropic/claude-sonnet-4-5 | Context and best practices |
| @tester | anthropic/claude-sonnet-4-5 | Coverage analysis |

## Severity Classification

| Severity | Meaning | Action |
|----------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |

## Output

Report: files reviewed, findings by severity, coverage, verdict.
