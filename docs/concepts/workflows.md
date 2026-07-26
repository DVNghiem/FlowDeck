# Workflows

FlowDeck structures every feature through a command cycle. Each step has a clear purpose, produces specific artifacts, and transitions the project state forward.

## The Command Cycle

```
/fd-task ──► /fd-review ──► /fd-execute ──► /fd-verify ──► /fd-done
                │
                └──► revise ──► (back to /fd-task)
```

Each command reads the current `STATE.md` and writes updated state when it completes. Use `/fd-checkpoint` at any time to save a mid-session snapshot and `/fd-resume` to restore it in a new session.

`/fd-task` performs the auto-init of `~/.fd-plan/<slug>/`, the codebase map, and the requirement confirmation that the v1 pipeline used to spread across five separate commands.

---

## `/fd-task` (artifacts)

**Purpose:** Auto-init `~/.fd-plan/<slug>/`, map the codebase, confirm requirements, and save the four artifacts (`task.md`, `architecture.md`, `affect.md`, `plan.md`) that every later stage reads.

**Files created/modified:**
- `~/.fd-plan/<slug>/STATE.md` (created if missing, topic + status updated)
- `~/.fd-plan/<slug>/architecture.md` (project-level tech design)
- `~/.fd-plan/<slug>/<topic>/task.md`
- `~/.fd-plan/<slug>/<topic>/architecture.md`
- `~/.fd-plan/<slug>/<topic>/affect.md`
- `~/.fd-plan/<slug>/<topic>/plan.md`
- `~/.fd-plan/<slug>/checkpoint.json`

**Step-by-step:**

1. Resolve `<slug>` from the project directory name.
2. If `~/.fd-plan/<slug>/` is missing, create it, map the codebase (preferring codegraph when fresh), and write the project-level `architecture.md`.
3. Run parallel research with `codegraph_context` / `codegraph_impact` (or `fdx-search` / `fdx-grep` as fallback).
4. Ask clarifying questions one at a time, suppressing any answer research already settled.
5. Draft all four artifacts.
6. Estimate complexity from `affect.md` and present it before `CONFIRM`.
7. On `CONFIRM`, write the four artifacts and update `STATE.md` with `topic`, `plan_confirmed: true`, and `last_action: "Task artifacts confirmed and saved"`.

---

## `/fd-review`

**Purpose:** Two-lens review of the task artifacts before execution — CEO review challenges scope and premise, engineering review checks architecture, edge cases, and blast radius.

**Files read:**
- `~/.fd-plan/<slug>/<topic>/task.md`
- `~/.fd-plan/<slug>/<topic>/architecture.md`
- `~/.fd-plan/<slug>/<topic>/affect.md`
- `~/.fd-plan/<slug>/<topic>/plan.md`
- `~/.fd-plan/<slug>/architecture.md`

**Step-by-step:**

1. Load all four artifacts; error on any missing file and point to `/fd-task` as the remedy.
2. Apply the CEO lens — right problem, right approach, acceptable risk, right scope.
3. Apply the engineering lens — architecture quality, edge cases, test coverage, blast radius.
4. Surface blocking and advisory findings.
5. `CONFIRM` (or revise) advances to `/fd-execute`.

---

## `/fd-execute`

**Purpose:** Implement `plan.md` using the TDD agent pipeline — parallel worktree guard from `affect.md`, wave-based execution, checkpoint after each wave.
2. It breaks the feature into **waves** — groups of tasks that can run in parallel within a wave, with waves ordered sequentially.
3. Each task records: description, responsible agent, files affected, rollback plan, and dependencies.
4. The plan is written to `PLAN.md`.
5. The user reviews the plan. Typing `CONFIRM` (case-insensitive) proceeds to execution; anything else aborts.
6. `STATE.md` is updated — set `phase: plan_confirmed`, `status: ready_to_execute`.

Wave-structured planning prevents agents from blocking on tasks that could run in parallel. Wave 1 tasks that are independent run simultaneously. Wave 2 does not start until all Wave 1 tasks are complete.

---

## /fd-execute

**Purpose:** Implement the feature following TDD discipline, with parallel agent delegation.

**Files created/modified:**
- Implementation files (modified)
- `.planning/STATE.md` (phase updated)
- `.planning/PLAN.md` (tasks marked complete)

**Step-by-step:**

1. The `@orchestrator` reads `PLAN.md` and iterates through waves.
2. For each wave, it calls `run-pipeline` or `delegate` to invoke specialist agents in parallel:
   - `@architect` — validates structural decisions before coding
   - `@coder` — writes implementation following TDD (red/green/refactor)
   - `@tester` — writes and runs tests alongside each implementation task
   - `@reviewer` — reviews each completed task
3. Each agent writes its output to the implementation files and updates `PLAN.md`.
4. Governance hooks run after every tool execution — patch trust scoring, budget tracking, and deadlock detection.
5. `STATE.md` is updated — set `phase: execute`, `status: in_progress`. On full completion, set `status: complete`.

If the deadlock detector triggers, execution pauses and the user is notified with the bounce signal.

---

## /fd-verify

**Purpose:** Full verification pipeline — tests, code review, security scan, and deploy check.

**Files created/modified:**
- Verification reports (printed to console)
- `.planning/STATE.md` (phase updated)
- `.codebase/SCORECARDS.jsonl` (new scorecard entry)

**Step-by-step:**

1. Run the full test suite — `@tester` executes all test commands.
2. Run `@reviewer` on every changed file since the last phase.
3. Run `@policy-enforcer` to validate architectural constraint compliance.
4. Run security scan (if configured) and deploy check (if configured).
5. Compute and print the Workflow Scorecard (10 dimensions).
6. Write a scorecard entry to `.codebase/SCORECARDS.jsonl`.
7. Update `STATE.md` — set `phase: verify`, `status: verified` or `status: issues_found`.
8. If issues are found, the user decides whether to loop back to `/fd-execute` or fix manually.

---

## State Transition Table

The following table shows how the key fields in `STATE.md` change at each phase:

| Field | `/fd-task` | `/fd-review` | `/fd-execute` | `/fd-verify` | `/fd-done` |
|-------|------------|--------------|---------------|--------------|------------|
| `phase` | `artifacts_saved` | `reviewed` | `in_progress` | `verified` | `complete` |
| `status` | `ready_for_review` | `ready_to_execute` | `in_progress` | `verified` | `complete` |
| `topic` | set | — | — | — | — |
| `planConfirmed` | — | `true` | — | — | — |
| `checkpoint` | on `/fd-checkpoint` | on `/fd-checkpoint` | on `/fd-checkpoint` | on `/fd-checkpoint` | on `/fd-checkpoint` |

---

## Wave-Structured Execution

Wave structure is the mechanism that makes parallel execution safe.

```
Wave 1 (parallel)
  ├── Task 1a: Write user model      → @coder
  ├── Task 1b: Write auth service    → @coder
  └── Task 1c: Write user tests      → @tester

Wave 2 (parallel, starts after all Wave 1 tasks complete)
  ├── Task 2a: Integrate auth        → @coder
  └── Task 2b: Write integration     → @tester
                tests

Wave 3 (sequential)
  └── Task 3a: Deploy configuration   → @architect
```

Dependencies between waves are explicit. Tasks within a wave are independent — no task in Wave 1 depends on another task in Wave 1. This maximizes parallelism while preserving ordering guarantees.

The orchestrator enforces wave ordering. It will not dispatch Wave 2 tasks until all Wave 1 tasks report completion. If a Wave 1 task fails, the orchestrator reports the failure and stops — Wave 2 is not entered.

---

## Adaptive Workflow Routing

FlowDeck uses **adaptive workflow routing** to select the minimal sufficient workflow for each task. The orchestrator scores tasks across multiple dimensions and chooses the lightest workflow that can reliably do the job.

### Workflow Classes

| Class | Stages | When Selected |
|-------|--------|---------------|
| `quick` | execute → verify | Simple, low-risk tasks (< 5 files, score ≥ 0.75) |
| `standard` | plan → execute → verify | Normal implementation tasks |
| `explore` | discuss → plan → execute → verify | Ambiguous or unfamiliar tasks |
| `ui-heavy` | discuss → design → plan → execute → verify | UI/UX-heavy tasks |
| `bugfix` | discuss → fix-bug → verify | Bug fixes |
| `docs-only` | write-docs → verify | Documentation-only changes |
| `verify-heavy` | plan → execute → verify | High blast radius or sensitive paths |

### Scoring Dimensions

The router scores tasks across 5 dimensions:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Simplicity | 30% | Is the task a simple rename, typo fix, or config update? |
| Confidence | 20% | How well does the task description match known patterns? |
| Low Risk | 20% | Is blast radius < 3 and are no sensitive paths touched? |
| Known Codebase | 15% | Is the codebase mapping fresh (< 24h)? |
| Cheap Complexity | 15% | Is the task cheap (classify, validate, summarize)? |

### Escalation

If the initial workflow proves insufficient during execution, the orchestrator escalates to a richer workflow:

- **quick → standard**: blast radius exceeds 3 files
- **standard → verify-heavy**: sensitive paths are touched
- **standard → ui-heavy**: design requirements emerge

Escalation is logged in `.codebase/WORKFLOW_ROUTING.jsonl` with the trigger and reason.

### Skipped Stages

For `quick` and `docs-only` workflows, the following stages are intentionally skipped:
- `discuss` — requirements are clear from the task description
- `plan` — the task is small enough to not need a formal plan

Skipped stages are logged in `STATE.md` under `skippedStages`.

---

## Mid-Session Checkpointing

Any step can be paused and resumed:

```bash
/fd-checkpoint   # Save current STATE.md snapshot
/fd-resume       # Reload latest checkpoint and continue
```

Checkpoints are written to `.planning/STATE.md`. The `/fd-resume` command reloads `STATE.md` and `PLAN.md` (if present) and reinitializes the context for the next phase step.
