---
description: Ship a completed task — finalize learning, update architect records, and optionally commit/push.
argument-hint: (none)
---

# /fd-ship

Finalizes a task that has passed QA (or was QA-skipped) and optionally commits/pushes the code.

---

## Pre-flight

1. Read task state from `.fd-plan/<slug>/.state.json`:
   - If task does not exist: report "No task found. Run /fd-task first."
   - If status is NOT `awaiting_ship`: report "Task status is '<status>', not awaiting_ship. Run /fd-qa first."

2. Read plan.md and qa.md from their respective paths.

---

## Final Confirmation

Print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to ship: <topic>
QA: <PASSED | SKIPPED>
Steps completed: <N>/<N>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Type CONFIRM to ship, or ABORT to abandon.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Wait for user response:
- **ABORT**: update status → `done` with `aborted: true`. Clear checkpoint. Print abort summary.
- **CONFIRM**: continue to ship flow.

---

## Ship Flow

1. Delegate to `@shipper` via task tool with:
   - plan.md path
   - research.md path
   - architect-affect.md path (if exists)
   - design.md path (if exists)
   - qa.md path
   - Output path: `planFilePath(root, slug, date, "learning")`
   - Project architect path: `.fd-plan/architect.md`
   - Orchestrator context packet

2. Wait for shipper to write learning.md and return `shipper-summary` block.

3. Ask user: "Commit and push? [yes / no]"
   - On `yes`: dispatch `fdx-git` to commit all changes with message `feat: <topic>` and push.
   - On `no`: continue without commit.

4. Update task status → `done`. Clear checkpoint.

5. Save state: `writeTaskState(root, taskState)`.

6. Print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Shipped: <topic>
Learning saved: .fd-plan/<slug>/YYYY-MM-DD-<slug>-learning.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Rules
- Never ship without explicit CONFIRM
- Only shipper writes learning.md and architect.md
- Always clear checkpoint after successful ship
- Commit message format: `feat: <topic>`
