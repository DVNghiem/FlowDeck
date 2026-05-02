---
name: plan-flow
description: "Orchestrates plan phase (guard check → context load → draft plan → validate → review → PAUSE CONFIRM → save)"
triggers:
  - /plan
steps:
  - name: guard_check
    agent: "@orchestrator"
    priority: first
    action: Verify DISCUSS.md exists and is confirmed; abort if not
  - name: load_context
    agent: "@orchestrator"
    action: Load PROJECT.md, STATE.md, DISCUSS.md with D-XX decisions
  - name: draft_plan
    agent: "@flowdeck-planner"
    action: Create PLAN.md with tasks traced to D-XX decisions from DISCUSS.md
  - name: validate_plan
    agent: "@flowdeck-plan-checker"
    action: Verify all requirements covered, all D-XX decisions addressed
  - name: review_plan
    agent: "@orchestrator"
    action: Present draft plan for user review
  - name: pause_confirm
    agent: "@orchestrator"
    action: "PAUSE — wait for user CONFIRM before saving"
  - name: save_plan
    agent: "@orchestrator"
    action: Save confirmed PLAN.md to .planning/phases/phase-N/
  - name: update_state
    agent: "@orchestrator"
    action: Update STATE.md with plan file path
---

# Plan Flow

## Purpose

Create a detailed implementation plan from confirmed DISCUSS.md decisions.

## Process

### Step 1: Guard Check

D-06: Verify DISCUSS.md exists and is confirmed.

If no DISCUSS.md found:
```
Error: DISCUSS.md not found. Run /discuss [topic] first.
```

If DISCUSS.md exists but not confirmed:
```
Error: DISCUSS.md not yet confirmed. Complete the discuss phase first.
```

Abort with clear error message in both cases.

### Step 2: Load Context

Read:
- PROJECT.md (project context)
- STATE.md (current phase and position)
- DISCUSS.md (D-XX decisions to trace in plan)

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

Save PLAN.md to `.planning/phases/phase-N/PLAN.md`.
Commit with message: `docs(phase-N): save confirmed plan`

### Step 8: Update State

Update STATE.md:
- Set plan_file to path of saved PLAN.md
- Set plan_confirmed: true
- Update last_action to "Plan confirmed"

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