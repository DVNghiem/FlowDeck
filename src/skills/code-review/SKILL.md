---
name: code-review
description: Systematic code review covering security vulnerabilities, logic errors, and quality issues. Returns findings ranked by severity with specific remediation steps. Use before merging any change.
origin: FlowDeck
---

# Code Review Skill

Finds real problems before they reach production. Reviews only changed code, reports only confirmed issues, and provides actionable fixes.

## When to Activate

Activate when:
- You just wrote or modified code
- A PR is ready for review
- You want a final check before pushing

## Core Principles

- Report only confirmed issues — 80%+ confidence before flagging
- Severity-ranked output: Critical → High → Medium → Pass
- Actionable fixes: every finding includes a specific remediation
- No style nitpicks unless they mask bugs

## Workflow

1. Run `git diff` or read specified files
2. Read full file context (not just the diff)
3. Trace call sites — who calls these functions?
4. Apply security checklist first
5. Apply quality checklist
6. Report by severity

## Security Checklist — CRITICAL

**SQL Injection:**
```typescript
// ❌ CRITICAL
const q = `SELECT * FROM users WHERE id = '${userId}'`;
// ✅ Parameterized
const q = db.query('SELECT * FROM users WHERE id = ?', [userId]);
```

**XSS:**
```html
<!-- ❌ CRITICAL -->
element.innerHTML = userInput;
<!-- ✅ -->
element.textContent = userInput;
```

**Hardcoded credentials:**
```typescript
// ❌ CRITICAL
const SECRET = "abc123hardcoded";
// ✅
const SECRET = process.env.API_SECRET;
```

**Path traversal:**
```typescript
// ❌ CRITICAL
fs.readFile(`./uploads/${filename}`);
// ✅
fs.readFile(path.join('./uploads', path.basename(filename)));
```

## Quality Checklist — HIGH

- Functions over 50 lines → extract
- Nesting deeper than 3 levels → extract guard clauses
- Empty or silent catch blocks → log and rethrow
- Dead code (defined but never called) → remove

## Performance — MEDIUM

- N+1 queries: database call inside a loop
- Missing pagination on list endpoints
- Synchronous I/O in hot paths

## Best Practices — LOW

- Inconsistent naming within a file
- Missing JSDoc on public functions
- `console.log` left in production code

## Output Format

```markdown
## Code Review Report

### 🔴 CRITICAL (must fix before merge)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | auth.ts | 42 | SQL injection | Use parameterized query |

### 🟠 HIGH (fix before merge)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

### 🟡 MEDIUM (fix in follow-up)
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

### ✅ PASS
- Auth middleware: present on all protected routes
- Input validation: correct at all boundaries
```
