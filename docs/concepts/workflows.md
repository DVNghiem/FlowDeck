# Workflows

FlowDeck structures every feature through a fixed five-stage pipeline. Each stage is a
slash command with a clear purpose, a defined set of inputs and outputs, and a strict
gating relationship to the next stage.

## The Pipeline

```
/fd-task ──────► /fd-review ──────► /fd-execute ──────► /fd-verify ──────► /fd-done
   │                 │                  │                  │                │
   ▼                 ▼                  ▼                  ▼                ▼
task.md,         design handoff,   plan.md,           affect.md         summary +
architecture.md  plan confirmed    steps_complete     regression check   commit + push
affect.md                         checkpoints
plan.md
```

Each command reads the current `~/.fd-plan/<slug>/STATE.md` and writes updated state
when it completes. Use `/fd-checkpoint` at any time to save a mid-session snapshot
and `/fd-resume` to restore it in a new session.

The stages are fixed and ordered — FlowDeck does not choose a subset of stages for a
given task. Every feature goes through all five.

---

## /fd-task

**Purpose:** Capture requirements and produce the planning artifacts that downstream
stages consume.

**Files created under `~/.fd-plan/<slug>/<topic>/`:**
- `task.md` — the requirements, acceptance criteria, scope, and out-of-scope list
- `architecture.md` — the technical approach, module boundaries, and tech-stack notes
- `affect.md` — the predicted affected files and dependency map
- `plan.md` — the wave-structured execution plan

**Files created at the project root `~/.fd-plan/<slug>/`:**
- `STATE.md` — created or updated with the active topic, status, and pipeline position
- `architecture.md` — the project-level architecture, updated as topics complete

The `@planner` agent produces these artifacts. The user confirms the plan by typing
`CONFIRM` in the chat before execution begins.

---

## /fd-review

**Purpose:** Review the plan and gate it for execution. Catches design problems, scope
drift, and missing acceptance criteria before any code is written.

**Inputs:**
- `task.md`, `architecture.md`, `affect.md`, `plan.md` from `/fd-task`

**Outputs:**
- `plan_confirmed: true` written to `STATE.md` when the plan passes review
- `design_stage: handoff_complete` and `design_approved: true` for UI-heavy topics
  (gates `/fd-execute` until the design handoff is complete)

If review finds blocking issues, they are listed in `STATE.md` `blockers` and
`/fd-execute` is refused until they are resolved.

---

## /fd-execute

**Purpose:** Implement the plan in waves, with parallel worktree execution guarded by
the file-affection graph from `affect.md`.

**Inputs:**
- `plan.md` (wave-structured steps)
- `affect.md` (the file-affection graph used by the parallel guard)
- `STATE.md` (`plan_confirmed: true`)

**Behavior:**
1. **Research gate** — probe `fdx-status`. When fresh, use `fdx-context`,
   `fdx-impact`, `fdx-explore`, and `fdx-trace` to map the blast
   radius. When stale, rebuild via `@mapper`.
2. **Guard check** — verify `affect.md` exists, `plan_confirmed: true`, and (for
   UI-heavy topics) `design_approved: true`.
3. **Parallel guard** — for each pair of plan steps, compute the file intersection.
   Empty intersection → run in parallel in worktree `fd-<slug>-wave-<N>`. Non-empty
   intersection → run sequentially.
4. **Wave execution** — `@coder` runs each step in the active wave, with `@reviewer`
   reviewing the diff and `@tester` running the test suite. Steps complete in
   BEHAVIOR → RED → GREEN → REFACTOR → COMMIT order.
5. **Checkpoint** — after each wave, update `~/.fd-plan/<slug>/checkpoint.json` with
   the new `current_stage: wave-<N>`.
6. **Handoff** — when all plan steps are complete, hand off to `/fd-verify`.

---

## /fd-verify

**Purpose:** Full verification gate. `/fd-done` will not close a topic until verify
passes.

**Inputs:**
- `affect.md` (the regression scope)
- `STATE.md` (`steps_complete` non-empty)

**Checks (in order):**
1. **Test suite** — `npm test` / `bun test` / `cargo test` / `pytest` / `go test ./...`
   depending on the project manifest. All tests must pass.
2. **Browser / E2E** — if Playwright is configured for a web project, run the E2E
   suite. Otherwise note that UI behavior is unverified in this run.
3. **Regression on affected files** — every file in `affect.md` must have test
   coverage. Uncovered changed files are a HIGH finding. Use `fdx-impact` to
   find dependents not listed in `affect.md`.
4. **Code review** (`@reviewer`) — security, quality, TDD discipline, ≥ 80% coverage
   on changed files.
5. **Security scan** (`@security-auditor`) — no hardcoded secrets, validated inputs
   at trust boundaries, auth on protected routes, no CRITICAL or HIGH findings.

**Outputs:**
- `status: verified` written to `STATE.md` on a passing verdict
- `status: not_verified` plus a `blockers` list on failure, with a rollback offer

---

## /fd-done

**Purpose:** Close the topic. `/fd-done` is blocked until `status: verified` is set
in `STATE.md` by a passing `/fd-verify`.

**Inputs:**
- `STATE.md` with `status: verified`

**Behavior:**
1. Summarize built-vs-required from `task.md` against the actual diff
2. Propose a Conventional Commits message; wait for user confirmation
3. On confirmation, `git add` + `git commit`
4. Ask whether to push; if yes, `git push -u origin <branch>`
5. Update `~/.fd-plan/<slug>/architecture.md` if the topic changed module structure
6. Update `STATE.md` to `status: complete` and `checkpoint.json` to
   `current_stage: complete`

---

## State Transitions

The following fields in `~/.fd-plan/<slug>/STATE.md` change as the pipeline runs:

| Field | After `/fd-task` | After `/fd-review` | After `/fd-execute` | After `/fd-verify` | After `/fd-done` |
|-------|------------------|--------------------|---------------------|--------------------|------------------|
| `status` | `in_progress` | `in_progress` | `in_progress` | `verified` or `not_verified` | `complete` |
| `topic` | set | — | — | — | — |
| `plan_confirmed` | `false` | `true` | — | — | — |
| `steps_complete` | `[]` | — | `[1, 2, ...]` | — | — |
| `blockers` | `[]` | `[]` or `[issue]` | `[]` | `[]` or `[failure]` | `[]` |

---

## Wave-Structured Execution

Wave structure is the mechanism that makes parallel execution safe. Two steps in the
same wave run in parallel only if the parallel guard classified them as having
empty file intersection. Waves run strictly in order — Wave 2 does not start until
all Wave 1 steps complete.

```
Wave 1 (parallel where safe)
  ├── Task 1a: Add OAuth login endpoint  → @coder
  ├── Task 1b: Add OAuth callback route  → @coder  (parallel with 1a — no shared files)
  └── Task 1c: Write OAuth flow tests    → @tester

Wave 2 (starts after Wave 1)
  ├── Task 2a: Add session middleware    → @coder  (depends on 1a, 1b)
  └── Task 2b: Add session tests         → @tester (depends on 2a)
```

The parallel guard overrides the wave grouping. Two steps in the same wave that share
files run sequentially within that wave, not in parallel.

---

## Mid-Session Checkpointing

Any point in the pipeline can be paused and resumed in a new session:

```
/fd-checkpoint   # Write ~/.fd-plan/<slug>/checkpoint.json with current state
/fd-resume       # Read checkpoint.json (falling back to STATE.md) and continue
```

`checkpoint.json` is the primary file `/fd-resume` reads. `STATE.md` is the fallback
when `checkpoint.json` is absent or unreadable.
