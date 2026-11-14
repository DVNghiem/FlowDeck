---
description: Show the current pipeline stage, artifact status, and blockers for the active topic
argument-hint: [--topic=<slug> | --all]
---

# Status

Resolve `<slug>` from `planning-state action:read`'s `planning_root`, including
when state is absent; never infer the planning directory from the project basename.

Show where the current task sits in the pipeline and what is blocking it.

**Input:** $ARGUMENTS — optional `--topic=<slug>` for a specific topic, `--all` to list
every topic in the project.

## Default: active topic

Read `~/.fd-plan/<slug>/checkpoint.json` first, falling back to
`~/.fd-plan/<slug>/STATE.md`. Resolve `<topic>` from `--topic`, else from `topic` in
STATE.md.
Show `workflowClass` and `verification` separately from lifecycle `status`.
For FAST, only `task.md` is required; for STANDARD, `affect.md` is optional; FULL
requires all four files. Mark optional absent artifacts as N/A, not blockers.
Check FDX with `fdx --version`; if absent or broken, display degraded mode and
do not claim graph impact. Report guard health only from hook/runtime diagnostics,
never from a SessionStart message alone.

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
Artifacts   task.md ✅  architecture.md ✅  affect.md ✅  plan.md ✅
Plan        <X> steps (<Y> complete)
Risk        <low|medium|high>   (from affect.md)
Worktrees   <names, or "none">
Blockers    <list, or "none">
════════════════════════════════════════════════════════════
Next: <next command in the pipeline>
```

Stage markers:
- `✅` — recorded complete in `checkpoint.json` `phases`, or implied by STATE.md status
- `🔄` — the stage named by `current_command`
- `⬜` — not yet reached
- `⏭️` — skipped, with the logged reason shown inline (trivial tasks only)

## All topics (`--all`)

List every topic directory under `~/.fd-plan/<slug>/`:

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

Read each topic's stage from its state and checkpoint: confirmed `task.md` →
`task`; `steps_complete` non-empty → `execute`; STATE.md `status: complete` → `done`.

## Blockers

When blockers exist, show them with the command that clears each one:

```
Blockers:
  ❌ required artifact missing    → run /fd-task
  ❌ verification failed: 2 tests → run /fd-execute, then /fd-verify
```

## Error Handling

- `~/.fd-plan/<slug>/` not found → `"No planning workspace. Run /fd-task to start."`
- `--topic` names a topic that does not exist → `"Topic '<topic>' not found."` followed
  by the available topics.
- `checkpoint.json` unreadable → fall back to STATE.md and note the fallback in the
  output rather than failing.
