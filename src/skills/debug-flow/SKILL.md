---
name: debug-flow
description: Systematic debugging workflow. Reproduce the issue, isolate root cause, write a failing test, fix, verify. Use when diagnosing bugs or unexpected behavior.
origin: FlowDeck
---

# Debug Flow Skill

Finds root causes through systematic investigation. Does not guess. Does not fix symptoms.

## When to Activate

Activate when:
- A bug has been reported
- Code is producing unexpected output
- Tests are failing intermittently
- An error is occurring in production

## Core Principles

- Read stack traces completely — never skip to the middle
- Fix root causes, not symptoms
- Check recent changes first — `git log --oneline -20`
- Reproduce before fixing — if you can't reproduce it, you don't understand it

## Workflow

1. **Reproduce** — confirm you can make the bug happen reliably
2. **Read the full stack trace** — start from the top (error), trace to the origin
3. **Check recent changes** — `git log --oneline -20` to find what changed
4. **Trace execution backward** — what called the failing function? What state did it receive?
5. **Identify root cause** — the earliest point where invariants are violated
6. **Write a failing test** — one test that fails with the bug present
7. **Fix** — change the minimum code to make the test pass
8. **Verify** — run the full test suite

## Common Root Causes

| Symptom | Likely Cause | Investigation |
|---------|-------------|---------------|
| `Cannot read property of undefined` | Missing null check upstream | Trace where undefined enters |
| Wrong calculation result | Type coercion (`"5" + 3 = "53"`) | Check input types |
| Race condition / intermittent | Missing `await` | Find async functions called without await |
| Auth bypass | Missing middleware | Check route definition vs working routes |
| Infinite loop | Wrong termination condition | Log loop counter, check exit logic |
| Memory leak | Event listener not cleaned up | Check `useEffect` returns, `removeListener` calls |
| Promise rejection unhandled | Missing `.catch()` or `try/catch` | Check all async call sites |
| Type error at runtime | `as any` hiding real type | Find where the cast was added |
| Stale data in UI | Cache not invalidated | Check cache keys and invalidation logic |
| Import error | Circular dependency or missing export | `npx madge --circular src/` |

## Bisect for Regressions

When something worked before but is broken now:

```bash
git bisect start
git bisect bad                    # current is broken
git bisect good [last-good-sha]   # last known working commit
npm test                          # run after each checkout
git bisect good                   # or: git bisect bad
git bisect reset                  # when done
```

## Output Format

```markdown
## Debug Report

**Root Cause**: [one sentence]
**Evidence**: `path/to/file.ts:42` — [what the code does wrong]
**Call Path**: request → controller → service → ❌ null dereference at line 42
**Fix**: [specific change to make]
**Test**: [name of the failing test that reproduces the bug]
```
