---
name: refactor-flow
description: "Safe refactoring workflow: baseline tests → one transform at a time → verify green → commit. No behavior changes."
triggers:
  - /refactor
steps:
  - name: baseline
    agent: "@tester"
    action: Run test suite and confirm green before any changes
  - name: identify_targets
    agent: "@mapper"
    action: Mapper identifies refactoring candidates (large files, duplication, complexity)
  - name: plan_transforms
    agent: "@refactor-guide"
    action: List specific transforms in low-to-high risk order
  - name: apply_transform
    agent: "@coder"
    action: Coder applies one transform at a time
  - name: verify
    agent: "@tester"
    action: Run test suite after each transform — must stay green
  - name: commit
    agent: "@orchestrator"
    action: Commit each transform separately with descriptive message
---

# Refactor Flow

## Purpose

Improve code structure without changing behavior. Each step must leave the test suite green.

## Rules

1. Tests must pass **before** you start — if broken, fix tests first
2. One transform per commit — never combine multiple in one step
3. No behavior changes — if a test breaks, undo and investigate
4. No new features during refactoring — separate PRs

## Process

### Step 1: Baseline

```bash
npm test
# Must be 100% GREEN before proceeding
```

If tests fail: fix them first. Do not refactor on a broken baseline.

### Step 2: Identify Refactoring Targets

Spawn `@mapper` to find:
- Files over 400 lines
- Functions over 50 lines
- Duplicated logic (3+ occurrences of same pattern)
- Deep nesting (> 4 levels)
- Unclear names

Prioritize: most impactful changes first.

### Step 3: Plan Transforms

List transforms in low-to-high risk order:

**Low risk** (one at a time):
- Rename variable/function within a file
- Extract constant from magic number
- Remove unused imports
- Reorder parameters (update all call sites)

**Medium risk** (test after each):
- Extract function from long method
- Move function to appropriate module
- Replace duplication with shared utility

**Higher risk** (full test run mandatory):
- Split large file into modules
- Change data shape
- Reorganize module structure

### Step 4: Apply One Transform

Spawn `@coder` to apply exactly ONE transform.

Example commit messages:
- `refactor: extract validateEmail from UserService`
- `refactor: rename userId to userID for consistency`
- `refactor: move auth helpers to auth/utils.ts`

### Step 5: Verify Green

```bash
npm test
# Still GREEN? Proceed to next transform.
# RED? Undo the transform, investigate why.
```

Never proceed to the next transform with a failing test.

### Step 6: Commit and Repeat

```bash
git commit -m "refactor: <what changed>"
# Return to Step 4 for next transform
```

## Output

After all transforms complete:

```
## Refactor Complete

Transforms applied: N
Files changed: N
Test suite: ✅ N/N passing

Changes:
- refactor: [description]
- refactor: [description]
```
