---
description: Save current task execution checkpoint explicitly.
argument-hint: (none)
---

# /fd-checkpoint

Explicitly saves the current task checkpoint. Can be called anytime during `/fd-execute`.

---

## Flow

1. Read task state from `.fd-plan/<slug>/.state.json`:
   - If no task exists: report "No active task. Run /fd-task first."

2. Load existing checkpoint with `loadCheckpoint(root, slug)`:
   - If no checkpoint exists: use current task state and step 0 as defaults

3. Write updated checkpoint with current timestamp:

```typescript
saveCheckpoint(root, slug, {
  taskState,
  currentStep: checkpoint?.currentStep ?? 0,
  completedSteps: checkpoint?.completedSteps ?? [],
  savedAt: new Date().toISOString(),
})
```

4. Print:

```
Checkpoint saved.
Task: <topic> — Step <N>/<total> complete
Resume with: /fd-resume
```

---

## Rules
- No agent involved — pure state management
- Always writes to `.fd-plan/<slug>/.checkpoint`
- Does not change task state status
