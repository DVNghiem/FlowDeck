---
name: test-coverage
description: Enforce test-first development and measure coverage gaps. Drives write-test → implement → verify. Use for new features and bug fixes.
origin: FlowDeck
---

# Test Coverage Skill

Ensures code is tested before it is considered done. Coverage numbers are a by-product — the goal is meaningful tests that catch real bugs.

## When to Activate

Activate when:
- Implementing a new feature (TDD: tests first)
- Fixing a bug (write failing test before fix)
- Coverage drops below threshold
- Preparing code for review

## Core Principles

- 80% minimum line coverage — no exceptions
- Tests before code, not after
- Test behavior, not implementation
- Every bug fix gets a regression test

## Workflow

1. **Write failing test** (Red) — describe the behavior you're about to implement
2. **Implement minimum code** (Green) — make the test pass
3. **Refactor** — clean up while keeping tests green
4. **Run coverage** — verify 80%+ threshold
5. **Add edge case tests** — for empty inputs, invalid inputs, error paths

## Coverage Commands

```bash
# vitest
npx vitest --coverage
npx vitest --coverage --reporter=verbose

# jest
npx jest --coverage

# view HTML report
open coverage/index.html
```

## Coverage Report Format

A passing coverage report looks like this:

```
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |   87.3  |   82.1   |   91.4  |   87.3  |
 auth.ts  |   94.2  |   88.0   |  100.0  |   94.2  |
 user.ts  |   80.1  |   76.4   |   85.7  |   80.1  |
----------|---------|----------|---------|---------|

Coverage threshold met: 80% ✅
```

A failing report looks like:

```
 services/payment.ts | 41.2 | 30.0 | 50.0 | 41.2 |

Coverage threshold NOT met: 41.2% < 80% ❌
Uncovered lines: 45-67, 89-112
```

## What to Test

| Category | Examples |
|---------|---------|
| Happy path | Normal inputs, expected outputs |
| Error conditions | Invalid inputs, missing fields, null |
| Edge cases | Empty arrays, zero values, max values |
| Auth | Unauthenticated, unauthorized, correct role |

## What NOT to Test

- Private methods (test via public interface)
- Third-party library behavior
- Simple property accessors with no logic
- Framework internals

## Troubleshooting Failures

- **Test failing after refactor**: undo the refactor, fix in smaller steps
- **Test failing after bug fix**: the test should have been failing before the fix
- **Low coverage on new code**: add edge case tests for all branches
- **Flaky tests**: find the shared state being mutated, isolate it
