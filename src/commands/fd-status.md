---
description: Show all FlowDeck tasks and their current status.
argument-hint: (none)
---

# /fd-status

Lists all tasks in `.fd-plan/` with their current status, stage, and step progress.

---

## Flow

1. Call `listTasks(root)` to get all task slugs under `.fd-plan/`.
2. For each slug, read state with `readTaskState(root, slug)`.
3. Format output:

```
FlowDeck Tasks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
● add-auth            executing    step 2/4
○ payment-feature     awaiting_confirm
✓ user-profile        done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Status icons:
- ● — pending or in-progress
- ○ — waiting for approval
- ✓ — done

4. If no tasks exist: print "No FlowDeck tasks found."

---

## Rules
- No agent involved — pure state read
- Does not modify any files
- Works for both Case 1 and Case 2 users
