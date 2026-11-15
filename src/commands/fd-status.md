---
description: Show the current pipeline stage, artifact status, and blockers for the active topic
argument-hint: [--topic=<slug> | --all]
---

# Status

Show where the current task sits in the pipeline and what is blocking it.

**Input:** $ARGUMENTS — optional `--topic=<slug>` for a specific topic, `--all` to list
every topic in the project.

## Default: active topic

Read `<project-root>/.fd-plan/checkpoint.json` first, falling back to
`<project-root>/.fd-plan/STATE.md`. Resolve `<topic>` from `--topic`, else from `topic` in
STATE.md.

```
════════════════════════════════════════════════════════════
Project: <slug>   Topic: <topic>
Updated: <timestamp>   Source: checkpoint.json | STATE.md
────────────────────────────────────────────────────────────
Pipeline
  ✅ fd-task     — artifacts confirmed
  ✅ fd-review   — 0 blocking findings
  🔄 fd-execute  — wave-2  ← current
  ⬜ fd-verify
  ⬜ fd-done
────────────────────────────────────────────────────────────
Tier        <FAST|STANDARD|FULL>   (from STATE.md; missing tier means legacy FULL)
Artifacts   task.md ✅  architecture.md ✅/—  affect.md ✅/—  plan.md ✅/—
Plan        <X> steps (<Y> complete), or inline task.md steps
Risk        <low|medium|high|unknown>   (from affect.md when present)
Worktrees   <names, or "none">
Blockers    <list, or "none">
════════════════════════════════════════════════════════════
Next: <next command in the pipeline>
```

Stage markers:
- `✅` — recorded complete in `checkpoint.json` `phases`, or implied by STATE.md status
- `🔄` — the stage named by `current_command`
- `⬜` — not yet reached
- `⏭️` — skipped, with the logged reason shown inline (tier-aware)

## All topics (`--all`)

List every topic directory under `<project-root>/.fd-plan/`:

```
════════════════════════════════════════════════════
TOPICS — <slug>
════════════════════════════════════════════════════
  ✅ add-oauth-login    — done       | updated <time>
  🔄 refactor-router    — execute    | updated <time>  ← active
  ⬜ cache-invalidation — task       | updated <time>
────────────────────────────────────────────────────
Total: 3 topics | 1 done | 1 in progress | 1 planned
════════════════════════════════════════════════════
```

Read each topic's stage from its artifacts on disk: `task.md` present with no confirmed plan →
`task`; confirmed inline steps or `plan.md` → `execute`; `steps_complete` non-empty →
`execute`; STATE.md `status: complete` → `done`.

## Blockers

When blockers exist, show them with the command that clears each one:

```
Blockers:
  ❌ required artifact missing    → run /fd-task
  ❌ verification failed: 2 tests → run /fd-execute, then /fd-verify
```

## Error Handling

- `<project-root>/.fd-plan/` not found → `"No planning workspace. Run /fd-task to start."`
- `--topic` names a topic that does not exist → `"Topic '<topic>' not found."` followed
  by the available topics.
- `checkpoint.json` unreadable → fall back to STATE.md and note the fallback in the
  output rather than failing.
