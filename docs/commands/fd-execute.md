# /fd-execute

**Purpose:** Implement the active topic's plan in waves via the orchestrator pipeline, defer full TDD verification to `/fd-verify`, and update `STATE.md` throughout.

## Usage

/fd-execute [--topic=<slug>] [--override] [--keep-worktree]

`--topic=<slug>` targets a topic other than the active one. `--override` bypasses the design-first approval gate and the caller records the reason in `STATE.md`. `--keep-worktree` skips worktree cleanup after merge. The topic itself resolves from `STATE.md`'s active `topic` field when `--topic` is not supplied.

## What Happens

1. **Research gate (before touching any code).**
   - Resolve the project slug, then probe freshness with `codegraph_status`.
   - `~/.fd-plan/<slug>/CODEBASE_INDEX.md` is the persisted map; `codegraph_status` is the freshness probe. When the probe says stale, rebuild the index or delegate to `@mapper` before reading it.
   - When the index is fresh, use `codegraph_context`, `codegraph_impact`, `codegraph_explore`, and `codegraph_trace` to navigate call paths in the active step's blast radius.
   - Verify `plan_confirmed: true` in `STATE.md` and check the topic's `task.md`, `architecture.md`, `affect.md`, and `plan.md` for any updates since the last write.
   - Verify design handoff is complete if `requires_design_first: true`.

2. **Guard check.**
   - Verify `~/.fd-plan/<slug>/` exists. If missing, abort with `"No planning workspace. Run /fd-task first."`
   - Resolve the active topic from `STATE.md` (or `--topic` when supplied).
   - Verify `plan_confirmed: true` in `STATE.md`.
   - Verify `~/.fd-plan/<slug>/<topic>/plan.md` exists.
   - Verify `~/.fd-plan/<slug>/<topic>/affect.md` exists. If missing, abort with `"Error: affect.md not found. Run /fd-task first."`
   - If `requires_design_first: true`, require `design_stage: handoff_complete` and `design_approved: true` (set by `/fd-review`), or pass `--override` with a reason logged in `STATE.md`.

3. **Load plan.** Read `plan.md`, `task.md`, `architecture.md`, `affect.md`, and the current `STATE.md`; identify which steps are already complete and skip them.

4. **Parallel guard (run before spawning any worktree).**
   1. Read `affect.md` → build the file list per task/wave.
   2. For each pair of tasks: compute the file intersection.
   3. Empty intersection → safe to run in parallel; create worktree `fd-<slug>-wave-<N>`.
   4. Non-empty intersection → run sequentially, log the reason.
   5. After all parallel worktrees finish → the orchestrator merges the results.
   6. On merge conflict → PAUSE, report to the human, do not auto-resolve.
   7. Clean up each worktree after its merge, unless `--keep-worktree` was passed.

5. **Execute waves.** Wave 1 steps run first; Wave 2 after Wave 1; Wave 3 after Wave 2. Steps inside a wave with no file intersection may run in parallel. No intra-wave dependencies.

   - Delegate each incomplete plan step to the appropriate specialist through the orchestrator: `@backend-coder`, `@frontend-coder`, or `@devops`.
   - Use `planning-state` and `fdx-context` for state transitions; delegate source, config, and test edits to the specialist agents.
   - Source/config/test edits stay with the delegated agent; do not write them directly from the orchestrator.
   - Record step completion in `STATE.md` after each step.

6. **Handoff.** When all plan steps in the active topic are complete, update `STATE.md` and run `/fd-verify` for the full TDD verification loop. Do not claim topic completion or update `STATE.md` to `status: complete` before `/fd-verify` succeeds.

## Output / State

`STATE.md` per-step update:
```yaml
steps_complete: [1, 2]
steps_pending: [3, 4, 5]
last_action: "Step 2 executed — source edits delegated to @backend-coder"
```

`STATE.md` on full topic execution (before `/fd-verify`):
```yaml
status: execution_complete
last_action: "All plan steps executed — handoff to /fd-verify"
next_action: "run /fd-verify"
```

`STATE.md` on full phase completion (after `/fd-verify` succeeds):
```yaml
status: complete
last_action: "Topic N execution and verification complete"
```

## Examples

```
/fd-execute
```

Run the wave-based execution pipeline for the active topic in `~/.fd-plan/<slug>/<topic>/plan.md`.

```
/fd-execute --topic=add-oauth-login
```

Execute phase 2 inside the active topic.

```
/fd-execute --override
```

Override the design-first approval gate; record the reason in `STATE.md`. Use sparingly.

## Related Commands

- `/fd-verify` — full TDD verification loop (required after execution)
- `/fd-resume` — reload state and continue if execution was interrupted
- `/fd-checkpoint` — save checkpoint before a long execution session
- `/fd-task` — produces the planning artifacts this command consumes
- `/fd-review` — sets `design_approved: true` so the guard check passes
