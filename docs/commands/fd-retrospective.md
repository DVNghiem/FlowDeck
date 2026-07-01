---
description: Run a post-task retrospective to capture lessons in .flowdeck/lessons.md
---

# /fd-retrospective

**Purpose:** Capture reusable lessons from the work that just finished.

## Usage

```
/fd-retrospective
```

## What Happens

1. **Load existing lessons.** Reads `.flowdeck/lessons.md` to avoid duplicate entries.
2. **Reflect.** Summarizes what worked well, what went wrong, root causes of repeated failures, and what to do differently next time.
3. **Capture lessons.** Writes one entry per reusable finding with context, mistake, lesson, and severity.
4. **Summarize.** Reports the captured lessons in under 10 lines.

## Output / State

File updated:
- `.flowdeck/lessons.md`

## Examples

```
/fd-retrospective
```

Runs a retrospective after the current task is complete.
