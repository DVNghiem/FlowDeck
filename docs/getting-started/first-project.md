# First Project — End-to-End Walkthrough

This guide walks through creating a simple feature end-to-end, showing what FlowDeck produces at each step.

## Step 1: Map the Codebase

```bash
fd-map-codebase
```

FlowDeck analyses the project and creates `.codebase/` with:
- `.codebase/CODEGRAPH.json` — dependency graph
- `.codebase/CONVENTIONS.md` — detected code conventions
- `.codebase/CODEBASE_INDEX.md` — high-level structural index

This step is required before starting a feature.

## Step 2: Start a Feature

```bash
fd-new-feature "user authentication"
```

FlowDeck initializes `.planning/` (if it doesn't exist yet) and creates `.planning/phases/phase-1/FEATURE.md`:

```markdown
# Feature: user authentication

## Description
user authentication

## Status
discuss

## Created
2026-05-26
```

## Step 3: Discuss

```bash
fd-discuss
```

The discusser agent runs structured Q&A and produces **`DISCUSS.md`**:

```markdown
# Discussion — user authentication

## Q: What is the scope?
A: [agent response]

## Q: What are the constraints?
A: [agent response]

## Decisions
- [captured decisions listed here]
```

## Step 4: Plan

```bash
fd-plan
```

When prompted, type `CONFIRM` to proceed. The planner generates **`PLAN.md`**:

```markdown
# Plan — user authentication

## Wave 1 (parallel)
- [ ] Implement user model
- [ ] Create auth service
- [ ] Write unit tests

## Wave 2 (parallel)
- [ ] Implement login endpoint
- [ ] Implement registration endpoint
- [ ] Add integration tests

## Wave 3 (sequential)
- [ ] Security audit
- [ ] Documentation
```

## Step 5: Execute

```bash
fd-execute
```

Agents work through each wave in `PLAN.md`. Independent tasks run in parallel. State is updated in `STATE.md` after each task.

## Step 6: Verify

```bash
fd-verify
```

Runs the full verification pipeline:
- Unit and integration tests
- Code review by reviewer agent
- Security scan
- Deploy check

Results are written to `.planning/VERIFICATION.md`.

## What You Have Now

After completing the full workflow:

```
.planning/
  STATE.md        — current phase and progress
  ROADMAP.md      — all features and timeline
  PLAN.md         — current feature execution plan
  DISCUSS.md      — captured decisions
  VERIFICATION.md — test results, review, security
.codebase/
  CODEGRAPH.json      — dependency graph
  CONVENTIONS.md      — detected code conventions
  CODEBASE_INDEX.md   — structural index
```

You can now run `/fd-status` to see the project overview, or start a new feature with `/fd-new-feature`.

