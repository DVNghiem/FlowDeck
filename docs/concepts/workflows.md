# Workflows

FlowDeck structures work through five stages. Each stage has a slash command,
while the planning artifacts and review effort vary by task risk.

## The Pipeline

```
/fd-task ──────► /fd-review ──────► /fd-execute ──────► /fd-verify ──────► /fd-done
   │                 │                  │                  │                │
   ▼                 ▼                  ▼                  ▼                ▼
task.md,         design handoff,   inline steps or    relevant tests     evidence +
optional design  plan confirmed    plan.md,           and review         summary
and impact       where needed      checkpoints
```

Each command reads the current `~/.fd-plan/<slug>/STATE.md` and writes updated state
when it completes. Here `<slug>` is the normalized directory name plus a
12-character hash of the canonical project path. An older basename-only directory
is reused only when its state identifies the same project; unattributed legacy
state is not migrated. Use `/fd-checkpoint` at any time to save a mid-session
snapshot and `/fd-resume` to restore it in a new session.

The stages remain ordered. Every task receives a verification verdict before
completion. FAST tasks may use a short inline plan, while FULL tasks use the four
planning artifacts.

---

## /fd-task

**Purpose:** Capture requirements and produce the planning artifacts that downstream
stages consume.

**Files created under `~/.fd-plan/<slug>/<topic>/`:**
- FAST: `task.md` with requirements and an inline mini-plan
- STANDARD: `task.md` with inline steps; `affect.md` when multi-file impact warrants it
- FULL: `task.md`, `architecture.md`, `affect.md`, and `plan.md`

**Files created at the project root `~/.fd-plan/<slug>/`:**
- `STATE.md` — created or updated with the active topic, status, and pipeline position
- `architecture.md` — the project-level architecture, updated as topics complete

With no arguments, `/fd-task` previews only requirements supported by available
conversation history. STANDARD and FULL ask for one confirmation of that preview;
FULL also requires execution approval. If history is unavailable or ambiguous,
the command asks for the missing task description.

---

## /fd-review

**Purpose:** Review the plan and gate it for execution. Catches design problems, scope
drift, and missing acceptance criteria before any code is written.

**Inputs:** `task.md` and any additional artifacts required by the chosen tier.

**Outputs:**
- `plan_confirmed: true` written to `STATE.md` when the plan passes review
- `design_stage: handoff_complete` and `design_approved: true` for UI-heavy topics
  (gates `/fd-execute` until the design handoff is complete)

If review finds blocking issues, they are listed in `STATE.md` `blockers` and
`/fd-execute` is refused until they are resolved.

---

## /fd-execute

**Purpose:** Implement the tier-appropriate plan. FULL plans can run independent
waves in parallel when `affect.md` establishes that they do not share files.

**Inputs:** inline steps from `task.md` or FULL `plan.md`, optional impact
information, and `STATE.md`.

**Behavior:**
1. Confirm required artifacts for the tier and any outstanding approvals.
2. Use FDX graph tools if available, or inspect repository files directly and
   label graph conclusions unavailable.
3. Apply TDD to behavior changes. For FULL plans, run independent waves in
   parallel only when file lists do not intersect.
4. Checkpoint progress and hand off to `/fd-verify`. No automatic commit occurs.

---

## /fd-verify

**Purpose:** Verification gate. `/fd-done` will not close a topic until verify
passes, regardless of tier.

**Inputs:** `task.md`, available impact artifacts, and `STATE.md`.

**Checks (in order):**
1. **Test suite** — `npm test` / `bun test` / `cargo test` / `pytest` / `go test ./...`
   depending on the project manifest. All tests must pass.
2. **Browser / E2E** — if Playwright is configured for a web project, run the E2E
   suite. Otherwise note that UI behavior is unverified in this run.
3. **Regression scope** — inspect `affect.md` when present and compare it with
   changed files. Use FDX impact data only when available.
4. **Review** — independent review is mandatory for FULL; security-sensitive
   work also receives a security audit.

**Outputs:** a `verification: verified` or `verification: not_verified` verdict
separate from task lifecycle `status`, plus blockers on failure.

---

## /fd-done

**Purpose:** Close the topic after `/fd-verify` records a passing verification verdict.

**Inputs:** `STATE.md` with `verification: verified`.

**Behavior:**
1. Summarize built-vs-required from `task.md` against the actual diff
2. Report evidence and any remaining gaps; suggest a commit message when useful
3. Do not commit, push, or deploy without a separate explicit instruction
4. Update `~/.fd-plan/<slug>/architecture.md` if the topic changed module structure
5. Update `STATE.md` to `status: complete` and `checkpoint.json` to
   `current_stage: complete`

---

## State Transitions

The following fields in `~/.fd-plan/<slug>/STATE.md` change as the pipeline runs:

| Field | After `/fd-task` | After `/fd-review` | After `/fd-execute` | After `/fd-verify` | After `/fd-done` |
|-------|------------------|--------------------|---------------------|--------------------|------------------|
| `status` | `in_progress` | `in_progress` | `in_progress` | unchanged | `complete` |
| `verification` | `not_verified` | — | — | `verified` or `not_verified` | `verified` |
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
