---
description: Execute an approved plan step-by-step, with TDD enforcement and per-step review and checkpointing.
argument-hint: (optional) [resume | abort]
---

# /fd-execute [resume | abort]

Executes an approved task plan from `/fd-task`. Dispatches each step to the correct coder subagent, reviews after each step, checkpoints after each completion.

---

## Pre-flight

1. Load task state from `.fd-plan/<slug>/.state.json`:
   - If task does not exist: report "No task found. Run /fd-task first."
   - If status is NOT `executing`: report "Task status is '<status>', not executing. Run /fd-task and confirm the plan first."

2. Load plan from `planFilePath(root, slug, date, "plan")`:
   - If plan file missing: report "Plan file not found: <path>. Run /fd-task first."

3. Check for checkpoint from `loadCheckpoint(root, slug)`:
   - If checkpoint exists and user didn't pass `abort`: ask "Found checkpoint at step N. Resume from step N+1? [resume / restart]"
   - If user chooses `resume`: skip completed steps, start from next incomplete step. Print "Resuming from step N+1: <title>"
   - If user chooses `restart`: clear checkpoint, start from step 1
   - If `abort` passed as argument: delete checkpoint and exit

---

## Per-step execution loop

For each step in plan (skipping completed steps from checkpoint):

### 1. Parse step

Extract from the step markdown block:
- title: string
- files: list of file paths
- what: string (implementation description)
- tdd.test: string (test spec)
- tdd.verify: string (how to verify test fails)
- tdd.implement: string (minimal code to pass)
- done_when: string (observable success criterion)
- coder: string ("backend-coder" | "frontend-coder" | "devops-coder")

### 2. Dispatch to coder

Call task tool to delegate to the correct coder agent with:
- Full step specification (all fields above)
- Research file path: `planFilePath(root, slug, date, "research")`
- Design file path (if exists): `planFilePath(root, slug, date, "design")`
- Architect-affect file path (if exists): `planFilePath(root, slug, date, "architect-affect")`
- Orchestrator context packet (step N of M, task topic, key patterns from research)

Wait for coder to complete. Coder returns a summary of changes made (files modified, test output, green phase output).

### 3. Dispatch to reviewer

Call task tool to delegate to `@reviewer` with:
- Step specification (same as passed to coder)
- Diff of changes made (git diff, or file-by-file summary)
- Test output (RED and GREEN phases) from coder response
- Code quality context from research.md

Wait for reviewer to output exactly one verdict block:
```review-verdict
status: APPROVED | APPROVED_WITH_NOTES | REJECTED
comments: [feedback]
```

### 4. Handle reviewer verdict

**APPROVED or APPROVED_WITH_NOTES:**
- Save checkpoint: `saveCheckpoint(root, slug, { taskState, currentStep: stepIndex, completedSteps: [...completed, title], savedAt: now })`
- Mark step complete, continue to next step
- Print: "[Step N/M] ✅ <title> APPROVED. Continuing..."

**REJECTED:**
- Print: "[Step N/M] ❌ <title> REJECTED. Reviewer feedback:"
- Print reviewer comments
- Ask: "Fix and resubmit? [YES / NO]"
- If YES: re-dispatch to SAME CODER with reviewer feedback injected: "Reviewer feedback: <comments>. Address and resubmit."
- Wait for coder retry. If rejected again after retry: stop, print rejection reason, ask "Abort or fix manually? [ABORT / CONTINUE]"
  - ABORT: exit, status stays `executing`, checkpoint saved at last approved step
  - CONTINUE: wait for user to fix manually. Type CONTINUE when ready, then re-dispatch to reviewer

---

## After all steps complete

- Update task status → "qa"
- Save state: `writeTaskState(root, taskState)`
- Clear checkpoint: `clearCheckpoint(root, slug)`
- Print: "✅ Execution complete. All steps approved. Run /fd-qa to verify."

## Checkpoint behavior

Checkpoint is saved after EVERY approved step, not just at the end.

Checkpoint structure:
```json
{
  "taskState": { task state snapshot },
  "currentStep": 2,
  "completedSteps": ["Step 1: Add auth middleware", "Step 2: Create user model"],
  "savedAt": "2026-07-13T08:00:00Z"
}
```

On resume:
- Load checkpoint
- Skip all steps in `completedSteps`
- Start execution from step after the last completed

On crash/interrupt:
- Checkpoint remains on disk
- User can `/fd-execute resume` to pick up where they left off

On all steps complete:
- Delete checkpoint: `clearCheckpoint(root, slug)`

---

## Error handling

**Coder throws error (unrecoverable):**
- Print error and stack trace
- Save checkpoint at last approved step
- Exit with: "Step N failed with error: <message>. Fix and run /fd-execute resume."

**Reviewer throws error:**
- Treat as REJECTED
- Coder gets retry with error context
- If second retry also errors: escalate to human

**User aborts mid-step:**
- Save checkpoint
- Exit gracefully
- User can resume with `/fd-execute resume`

---

## Rules

- Never skip the approval gate — all steps must pass review
- Always show test output (RED and GREEN phases) to verify TDD
- Always save checkpoint after approved step
- Never proceed past REJECTED without coder retry
- On second rejection: pause and ask human for manual fix

---

## Examples

### Example 1: Normal execution

```
$ /fd-task "Add user authentication"
[Explorer] Exploring requirements...
[Researcher] Researching codebase...
[Planner] Creating implementation plan...

Plan ready for: Add user authentication
Review: .fd-plan/add-user-auth/2026-07-13-add-user-auth-plan.md

Type CONFIRM to proceed to /fd-execute.
Or describe changes needed.

CONFIRM

$ /fd-execute

[Pre-flight] Task found: add-user-auth (status: executing)
[Pre-flight] Plan loaded: 4 steps
[Pre-flight] No checkpoint found

[Step 1/4] Database schema: add users table
[Backend Coder] Writing test...
[Backend Coder] Test fails (RED) ✓
[Backend Coder] Implementing schema...
[Backend Coder] Test passes (GREEN) ✓
[Reviewer] Checking spec compliance...
[Reviewer] Checking code quality...
✅ APPROVED

[Step 2/4] API endpoint: POST /users
...

✅ Execution complete. All steps approved. Run /fd-qa to verify.
```

### Example 2: Resume from checkpoint

```
$ /fd-execute

[Pre-flight] Task found: add-user-auth (status: executing)
[Pre-flight] Plan loaded: 4 steps
[Pre-flight] Checkpoint found at step 2

Resume from step 3? [resume / restart]

resume

Resuming from step 3/4: User validation middleware
[Backend Coder] Writing test...
...
```
