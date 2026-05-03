---
description: Create detailed implementation plan from DISCUSS.md decisions — save PLAN.md, update STATE.md, require CONFIRM before execution
argument-hint: [--phase=N] [--yes]
---

# Plan

Create a detailed implementation plan from confirmed discussion decisions.

**Input:** $ARGUMENTS (optional `--phase=N` to target a specific phase, `--yes` to skip confirmation)

## Pre-flight

1. Check `.planning/STATE.md` exists — if not, return error: "Run /fd-new-project first."
2. Determine phase: use `--phase=N` from arguments, or read current phase from STATE.md.
3. Check `.planning/phases/phase-<N>/DISCUSS.md` exists — if not, return error: "Run /fd-discuss first."

## Confirmation Gate

Unless `--yes` is passed or STATE.md already has `plan_confirmed: true`:

Show a preview of the DISCUSS.md decisions found and ask:

```
═══════════════════════════════════════════
PLAN PHASE <N> — AWAITING CONFIRMATION
═══════════════════════════════════════════

Found <X> decisions in DISCUSS.md:
<preview of D-XX lines>

Type CONFIRM to save PLAN.md and enable execution.
═══════════════════════════════════════════
```

**PAUSE** — wait for user to type CONFIRM before proceeding.

## Plan Generation

After confirmation:

1. Read all `D-XX: <decision>` lines from DISCUSS.md.
2. Generate `.planning/phases/phase-<N>/PLAN.md`:

```markdown
# Implementation Plan

**Phase:** <N>
**Created:** <timestamp>
**Source:** DISCUSS.md (<X> decisions)

## Decisions

- D-01: <decision>
- D-02: <decision>

## Steps

- [ ] Step 1: <concrete implementation step traced to decision>
- [ ] Step 2: <concrete implementation step>
- [ ] Step 3: <concrete implementation step>

## Acceptance Criteria

- [ ] <criterion from DISCUSS.md>
- [ ] <criterion from DISCUSS.md>

## Status

CONFIRMED
```

3. Update `.planning/STATE.md`:
   - Set `plan_confirmed: true`
   - Set `confirmed_at: <timestamp>`
   - Set `status: in_progress`

## Completion

Report: plan saved, decisions count, file path, next step: run `/fd-new-feature` or `/fd-fix-bug`.
