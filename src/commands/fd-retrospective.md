---
description: Run a post-task retrospective to capture lessons in .flowdeck/lessons.md
---

The task is now complete (or stopped). Run a brief retrospective:

1. Call `review-lessons` (no keywords) to load the current contents of `.flowdeck/lessons.md` so you can see what has already been captured and avoid duplicates.
2. Reflect on the work just finished:
   - What worked well? (1-3 points)
   - What went wrong or caused unexpected loops?
   - Root cause of any repeated failures?
   - What would you do differently next time?
3. Call `capture-lesson` once per reusable finding. Use:
   - `context` — what task or situation the lesson applies to
   - `mistake` — what went wrong
   - `lesson` — what to do differently
   - `severity` — `low`, `medium`, or `high`
4. Summarize what was captured in your final reply. Keep the summary under 10 lines.

Focus on reusable patterns, not one-off details. If the existing lessons already cover a finding, do not re-capture it — reference the existing entry instead.
