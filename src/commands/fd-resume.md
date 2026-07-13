---
description: Resume an interrupted task from the last checkpoint.
argument-hint: (none)
---

# /fd-resume

Resumes an interrupted task from the last checkpoint.

---

## Flow

1. Call `listPendingTasks(root)` to find all tasks not in status `done`.

2. If no pending tasks found: print "No pending tasks found." and exit.

3. If multiple pending tasks found: ask user which one to resume:

```
Pending tasks:
  1. add-auth (executing, step 2/4)
  2. fix-login (planning)

Which task do you want to resume? [1 / 2]
```

4. If exactly one pending task: confirm before resuming:

```
Resume <topic> from step <N>? [yes / no]
```

5. Load checkpoint with `loadCheckpoint(root, slug)`.

6. Route based on task status:

| Status | Message | Next command |
|---|---|---|
| `executing` | "Resuming /fd-execute from step <N>: <title>. Run /fd-execute." | /fd-execute |
| `awaiting_confirm` | "Plan is ready and waiting for CONFIRM. Run /fd-task." | /fd-task |
| `qa` | "Ready for QA. Run /fd-qa." | /fd-qa |
| `awaiting_ship` | "Ready to ship. Run /fd-ship." | /fd-ship |
| `exploring` / `researching` / `planning` | "Task was in <stage> stage. Run /fd-task to continue." | /fd-task |

---

## Rules
- No agent involved — pure state management and routing
- Always confirm before resuming if multiple pending tasks exist
- If no checkpoint exists, resume from step 0
