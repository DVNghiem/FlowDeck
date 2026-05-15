---
description: Create detailed implementation plan from DISCUSS.md decisions — save PLAN.md, update STATE.md, require CONFIRM before execution
argument-hint: [--phase=N] [--yes]
---

# Plan

Create a detailed implementation plan from confirmed DISCUSS.md decisions.

**Input:** $ARGUMENTS (optional `--phase=N` to target a specific phase, `--yes` to skip confirmation)

## Process

### Step 1: Guard Check

D-06: Verify DISCUSS.md exists and is confirmed.

If no DISCUSS.md found:
```
Error: DISCUSS.md not found. Run /fd-discuss [topic] first.
```

If DISCUSS.md exists but not confirmed:
```
Error: DISCUSS.md not yet confirmed. Complete the discuss phase first.
```

Abort with clear error message in both cases.

### Step 2: Load Context

Read:
- `.codebase/PROJECT.md` (project context)
- `.planning/STATE.md` (current phase and position)
- `.planning/phases/phase-<N>/DISCUSS.md` (D-XX decisions to trace in plan)

### Step 3: Draft Plan

Create PLAN.md with:
- Tasks that trace to D-XX decisions from DISCUSS.md
- Each task includes `<action>` referencing relevant D-XX decisions
- Wave assignments for parallel execution
- File dependencies between tasks

### Step 4: Validate Plan

Verify:
- All requirements from ROADMAP.md for current phase are addressed
- All D-XX decisions from DISCUSS.md are traced in plan tasks
- No tasks that contradict prior decisions

If validation fails, return to Step 3 to revise.

### Step 5: Review Plan

Present draft plan to user:
- Show all tasks and their D-XX decision traces
- Show wave structure
- Show file dependencies

### Step 6: PAUSE CONFIRM

D-06: "PAUSE — wait for user CONFIRM before saving"

Present:
```
Ready to save PLAN.md?
Type CONFIRM to save, or describe changes needed.
```

If user types CONFIRM, proceed to Step 7.
If user requests changes, return to Step 3 with feedback.

### Step 7: Save Plan

Save PLAN.md to `.planning/phases/phase-<N>/PLAN.md`.
Commit with message: `docs(phase-N): save confirmed plan`

### Step 8: Update State

Update STATE.md:
- Set plan_file to path of saved PLAN.md
- Set plan_confirmed: true
- Update last_action to "Plan confirmed"
- If task is UI-heavy, set `requires_design_first: true` and `design_stage: pending`
- Suggest running `/fd-design --mode=draft` immediately after plan confirmation

## D-06 Compliance

- Requires confirmed DISCUSS.md before proceeding
- Aborts with clear error if DISCUSS.md not confirmed
- Creates PLAN.md tracing D-XX decisions
- Pauses for user CONFIRM before saving

## Error Handling

D-03: Fail fast with clear error
- If guard check fails: abort with clear error and remediation
- If plan validation fails: show what's missing
- No partial plan saved on error

## Completion

Report: plan saved, decisions count, file path, next step: run `/fd-execute` or `/fd-fix-bug`.
