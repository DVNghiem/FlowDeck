---
description: Run quality assurance on an executed task — verify tests and all plan done-when criteria.
argument-hint: (none)
---

# /fd-qa

Runs the full QA pipeline for a task that has completed `/fd-execute`.

---

## Pre-flight

1. Read task state from `.fd-plan/<slug>/.state.json`:
   - If task does not exist: report "No task found. Run /fd-task first."
   - If status is NOT `qa`: report "Task status is '<status>', not qa. Run /fd-execute first."

2. Read plan.md from `planFilePath(root, slug, date, "plan")`:
   - If plan file missing: report "Plan file not found. Run /fd-task first."

3. Read research.md from `planFilePath(root, slug, date, "research")`:
   - If missing: continue with empty research context

---

## QA Dispatch

Delegate to `@qa` via task tool with:
- plan.md path
- research.md path (if exists)
- All done-when criteria extracted from plan.md
- Output path: `planFilePath(root, slug, date, "qa")`
- Orchestrator context packet

Wait for QA agent to output a `qa-result` block.

---

## Parse QA Result

Parse the `qa-result` block:

```qa-result
QA_PASS
tests: <N> passed
criteria: all <N> step done-when criteria met
```

or:

```qa-result
QA_FAIL
tests: <N> passed, <M> failed
criteria_failed:
  - Step 2: <done-when criterion> — <why it failed>
```

---

## On QA_PASS

- Update task status → `awaiting_ship`
- Save state: `writeTaskState(root, taskState)`
- Print pass summary
- Suggest: "Run /fd-ship to finalize."

---

## On QA_FAIL

Pause and print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA FAILED: <N> criteria not met
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
See: .fd-plan/<slug>/YYYY-MM-DD-<slug>-qa.md

Options:
  FIX    — return to /fd-execute to fix failing steps
  SKIP   — accept current state and proceed to /fd-ship
  ABORT  — abandon this task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Wait for user response:
- **FIX**: update status → `executing`. Save state. Print "Run /fd-execute to fix the failing steps."
- **SKIP**: update status → `awaiting_ship`. Save state with `qaSkipped: true`. Suggest `/fd-ship`.
- **ABORT**: update status → `done` with `aborted: true`. Clear checkpoint. Print abort summary.

---

## Rules
- QA agent never fixes bugs — only reports
- If tests fail, always give the user explicit options (FIX / SKIP / ABORT)
- Always save state after status changes
- QA report is written to the qa.md file before the user sees the summary
