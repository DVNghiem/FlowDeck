# Workflows

FlowDeck structures every feature through a six-step command cycle. Each step has a clear purpose, produces specific artifacts, and transitions the project state forward.

## The Six-Step Cycle

```
/fd-map-codebase
      │
      ▼
/fd-new-feature ─────────────────────────────────────────┐
      │                                                 │
      ▼                                                 │
/fd-discuss ─────────────────────────────────────────┐   │
      │                                              │   │
      ▼                                              │   │
/fd-plan ─────────────────────────────────────────┐  │   │
      │                                            │  │   │
      ▼                                            │  │   │
/fd-execute ──────────────────────────────────┐    │  │   │
      │                                      │    │  │   │
      ▼                                      │    │  │   │
/fd-verify ───────────────────────────────────┘    │  │   │
                                                   │  │   │
               (loop back to /fd-new-feature) ◄───┘  └───┘
```

Each command reads the current `STATE.md` and writes updated state when it completes. Use `/fd-checkpoint` at any time to save a mid-session snapshot and `/fd-resume` to restore it in a new session.

---

## /fd-map-codebase

**Purpose:** Analyse and index the codebase into structured `.codebase/` files — required before starting any feature.

**Files created:**
- `.codebase/CODEGRAPH.json`
- `.codebase/CONVENTIONS.md`
- `.codebase/CODEBASE_INDEX.md`

**Step-by-step:**

1. Scan the project files and detect languages, frameworks, and patterns.
2. Build a structured dependency graph and write it to `.codebase/CODEGRAPH.json`.
3. Extract conventions and write them to `.codebase/CONVENTIONS.md`.
4. Write a high-level index to `.codebase/CODEBASE_INDEX.md`.

---

## /fd-new-feature

**Purpose:** Define a new feature and initialize its context. Requires codebase mapping (`.codebase/`) to exist.

**Files created/modified:**
- `.planning/FEATURE.md` (created)
- `.planning/STATE.md` (created if missing, phase updated)
- `.planning/ROADMAP.md` (feature entry added)

**Step-by-step:**

1. Verify `.codebase/` exists — error if not (codebase mapping is required first).
2. Initialize `.planning/` and `STATE.md` lazily if they do not exist.
3. Parse the feature description from the command argument.
4. Create `FEATURE.md` with: feature name, summary, acceptance criteria, estimated complexity, related files.
5. Append the feature to `ROADMAP.md` with status `pending`.
6. Update `STATE.md` — set `phase: define`, `feature: <name>`, `status: in_progress`.

---

## /fd-discuss

**Purpose:** Pre-planning structured Q&A to capture design decisions before a plan is written.

**Files created/modified:**
- `.planning/DISCUSS.md` (created)
- `.planning/STATE.md` (phase updated)

**Step-by-step:**

1. The `@discusser` agent asks a series of targeted questions covering: scope boundaries, edge cases, dependencies, non-functional requirements, and known risks.
2. Each answer is recorded in `DISCUSS.md` under a corresponding heading.
3. The `@risk-analyst` agent reviews the Q&A log and adds a risk summary section.
4. `STATE.md` is updated — set `phase: discuss`, `status: ready_to_plan`.

The output of `/fd-discuss` is a signed decision log that the planner treats as authoritative input.

---

## /fd-plan

**Purpose:** Build a wave-structured execution plan from the discuss decisions.

**Files created/modified:**
- `.planning/PLAN.md` (created)
- `.planning/STATE.md` (phase updated)

**Step-by-step:**

1. The `@planner` agent reads `DISCUSS.md`, `FEATURE.md`, and `PROJECT.md`.
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

| Field | `/fd-map-codebase` | `/fd-new-feature` | `/fd-discuss` | `/fd-plan` | `/fd-execute` | `/fd-verify` |
|-------|--------------------|-------------------|---------------|------------|---------------|--------------|
| `phase` | — | `define` | `discuss` | `plan_confirmed` | `execute` | `verify` |
| `status` | — | `in_progress` | `ready_to_plan` | `ready_to_execute` | `in_progress` → `complete` | `verified` |
| `feature` | — | set | — | — | — | — |
| `planConfirmed` | — | — | — | `true` | — | — |
| `checkpoint` | — | — | — | — | on `/fd-checkpoint` | — |

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

## Mid-Session Checkpointing

Any step can be paused and resumed:

```bash
/fd-checkpoint   # Save current STATE.md snapshot
/fd-resume       # Reload latest checkpoint and continue
```

Checkpoints are written to `.planning/STATE.md`. The `/fd-resume` command reloads `STATE.md` and `PLAN.md` (if present) and reinitializes the context for the next phase step.
