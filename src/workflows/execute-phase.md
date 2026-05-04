---
name: execute-phase
description: "Orchestrates /execute-phase [N] — delegates to orchestrator with checkpoint protocol"
triggers:
  - /execute-phase
steps:
  - name: verify_prerequisites
    agent: "@orchestrator"
    action: Check .planning/, .codebase/, plan_confirmed flag
  - name: load_context
    agent: "@orchestrator"
    action: Load PLAN.md, STATE.md, PROJECT.md
  - name: execute_tasks
    agent: "@orchestrator"
    action: Delegate each task to appropriate specialist (@coder, @tester, etc.)
  - name: checkpoint_protocol
    agent: "@orchestrator"
    action: After each task, checkpoint state via planning-state tool
  - name: present_results
    agent: "@orchestrator"
    action: Present execution summary
  - name: update_state
    agent: "@orchestrator"
    action: Mark phase complete in STATE.md and ROADMAP.md
---

# Execute Phase Workflow

## Purpose

Execute `/execute-phase [N]` to implement a phase plan using the orchestrator agent.

## Prerequisites

Before executing, verify:
1. `.planning/` exists
2. `.codebase/` exists
3. `.planning/phases/phase-N/PLAN.md` exists and is confirmed

## Process

### Step 1: Verify Prerequisites

Guard check:
- `.planning/` directory must exist
- `.codebase/` directory must exist
- `STATE.md` has `plan_confirmed: true`
- `PLAN.md` exists in `.planning/phases/phase-N/`

If any check fails, abort with clear error and remediation steps.

### Step 2: Load Context

Read into execution context:
- `.planning/PROJECT.md` (project goals and tech stack)
- `.planning/STATE.md` (current phase and progress)
- `.planning/phases/phase-N/PLAN.md` (implementation plan)
- `.codebase/ARCHITECTURE.md` (if exists)
- `.codebase/CONVENTIONS.md` (if exists)

### Step 3: Execute Tasks

Orchestrator delegates each task to appropriate specialist agents:
- @coder for implementation
- @tester for tests
- @researcher for research tasks
- etc.

Each task:
1. Execute via delegated agent
2. Run verification tests for each task
3. Commit atomically with message: `feat(phase-N): task description`
4. Handle deviations (document, pause for approval if checkpoint)

### Step 4: Checkpoint Protocol

After each task:
- Call `planning-state.update_planning_state()` with current progress
- Update `steps_complete`, `last_action`, `next_action`
- Append to session history (never overwrite)

If session interrupted:
- User can resume with `/resume`
- Orchestrator will pick up from last checkpoint

### Step 5: Present Results

On completion, present:
```
## Phase [N] Execution Complete

**Executed:** [date]
**Tasks:** [N] completed
**Duration:** [time]

### What Was Built
[Summary of deliverables]

### Key Decisions
- [D-XX]: [decision made during execution]

### Deviations
- [Any deviations from original plan]

### Verification
- [x] Criterion 1
- [x] Criterion 2
```

### Step 6: Update State

Update STATE.md:
- Set `status: complete` for current phase
- Update `last_action` to "Phase N complete"
- Append to session history

Update ROADMAP.md:
- Mark phase N as "complete"

## Agent Configuration

| Agent | Model | Purpose |
|-------|-------|---------|
| orchestrator | Sonnet 4.6 | Coordinates plan execution via delegation |

## Output Files

- `.planning/phases/phase-N/SUMMARY.md` — execution summary
- `.planning/phases/phase-N/RESULT.md` — final outcome (legacy)
- STATE.md — updated with phase completion

## Deviation Handling

If implementation requires deviating from plan:
1. Document the deviation in SUMMARY.md
2. If at checkpoint: pause and get user approval
3. If minor: continue and document
4. Update PLAN.md with adjusted approach

## Error Handling

- If task fails: stop at checkpoint, preserve state
- User can run `/fix-bug` or manually fix
- Resume picks up from last successful checkpoint
- Never leave partial state on error