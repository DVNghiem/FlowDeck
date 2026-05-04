# FlowDeck Workflows

Workflows define how agents collaborate in multi-step sequences. They live in `flowdeck/workflows/` as reference documents — agents read and follow them, but you don't invoke workflows directly. Commands trigger them.

## How Workflows Work

1. You run a command (e.g., `/fd-plan`)
2. The command's plugin handler injects workflow context into the session
3. The AI reads the workflow steps and delegates to the named agents in order
4. Each step's output becomes context for the next step
5. The workflow may pause for user confirmation before irreversible actions

## The Core FlowDeck Cycle

```
/fd-new-project
     ↓
 /fd-discuss  →  .planning/phases/phase-N/DISCUSS.md  (locked decisions)
     ↓
 /fd-plan     →  .planning/phases/phase-N/PLAN.md     (confirmed plan)
     ↓
 /fd-new-feature  →  implemented, tested, reviewed code
     ↓
 /fd-review-code  →  review report (CRITICAL/HIGH/MEDIUM/PASS)
     ↓
 /fd-deploy-check →  GO / NO-GO decision
     ↓
 /fd-checkpoint   →  .planning/STATE.md saved
```

Each step gates the next. `/fd-plan` will not proceed without a confirmed `DISCUSS.md`. `/fd-new-feature` will not execute without a confirmed `PLAN.md`.

---

## Workflow Reference Table

| Workflow file | Triggered by | Agents involved |
|--------------|-------------|----------------|
| `discuss-flow.md` | `/fd-discuss` | `@orchestrator`, `@discusser` |
| `plan-flow.md` | `/fd-plan` | `@orchestrator`, `@planner`, `@plan-checker` |
| `plan-phase.md` | `/fd-plan-phase [N]` | `@planner`, `@plan-checker`, `@orchestrator` |
| `execute-flow.md` | `/fd-new-feature` | `@orchestrator`, `@coder`, `@reviewer` |
| `execute-phase.md` | `/execute-phase [N]` | `@orchestrator`, `@orchestrator` |
| `fix-bug-flow.md` | `/fd-fix-bug` | `@orchestrator`, `@debug-specialist`, `@researcher`, `@tester`, `@coder`, `@reviewer` |
| `debug-flow.md` | `/debug` | `@debug-specialist`, `@tester`, `@coder` |
| `review-code-flow.md` | `/fd-review-code` | `@orchestrator`, `@parallel-coordinator`, `@reviewer`, `@researcher`, `@tester` |
| `deploy-check-flow.md` | `/fd-deploy-check` | `@parallel-coordinator`, `@orchestrator`, `@security-auditor`, `@tester`, `@reviewer` |
| `refactor-flow.md` | `/refactor` | `@tester`, `@mapper`, `@refactor-guide`, `@coder`, `@orchestrator` |
| `write-docs-flow.md` | `/fd-write-docs` | `@code-explorer`, `@writer`, `@reviewer`, `@doc-updater` |
| `map-codebase-flow.md` | `/fd-map-codebase` | `@orchestrator`, `@mapper` (×6 in parallel) |
| `parallel-execution-flow.md` | Triggered by `@parallel-coordinator` | `@parallel-coordinator`, `@researcher`, `@code-explorer`, `@architect`, `@coder`, `@tester`, `@reviewer`, `@security-auditor` |
| `multi-repo-flow.md` | `/fd-multi-repo` | `@multi-repo-coordinator`, `@architect`, `@coder`, `@tester`, `@reviewer` |

---

## Detailed Workflow Descriptions

### discuss-flow

**Triggered by:** `/fd-discuss`

The discuss flow drives the requirements extraction phase. It starts by loading `PROJECT.md` and `STATE.md` to understand the current phase and any decisions already made. The `@orchestrator` extracts the current phase number, then spawns `@discusser` with that context so it avoids re-asking about settled decisions.

The `@discusser` asks one question per turn, records every decision as `D-XX` with its rationale, and detects conflicts between new answers and existing decisions before proceeding. The Q&A loop continues until all required topics are covered. When complete, all decisions are written to `.planning/phases/phase-N/DISCUSS.md`.

Before the file is marked confirmed, `@orchestrator` presents a summary of all decisions to the user and requires explicit confirmation. Nothing in DISCUSS.md is treated as locked until the user confirms.

**Steps:**
1. `@orchestrator` — Load `PROJECT.md` and `STATE.md`
2. `@orchestrator` — Extract current phase number
3. `@discusser` — Q&A loop, one question per turn
4. `@discusser` — Record decisions with D-XX numbering
5. `@discusser` — Save to `.planning/phases/phase-N/DISCUSS.md`
6. `@orchestrator` — Present summary; require user confirmation

**Workflow format:**
```yaml
---
name: discuss-flow
description: "Orchestrates discuss phase (context load → @discusser Q&A → pause → decisions → save)"
triggers:
  - /fd-discuss
steps:
  - name: load_context
    agent: "@orchestrator"
    priority: first
    action: Load PROJECT.md and current phase STATE.md
  - name: determine_phase
    agent: "@orchestrator"
    action: Extract current phase number from STATE.md
  - name: invoke_discusser
    agent: "@discusser"
    action: Spawn @discusser agent with project context
  - name: qa_loop
    agent: "@discusser"
    action: Discusser asks one question at a time; user responds; repeat until all topics covered
  - name: save_decisions
    agent: "@discusser"
    action: Write all decisions to .planning/phases/phase-N/DISCUSS.md with D-XX numbering
  - name: confirm_discuss
    agent: "@orchestrator"
    action: Present summary to user; require explicit confirmation before marking DISCUSS.md as confirmed
---
```

---

### plan-flow

**Triggered by:** `/fd-plan`

The plan flow creates an execution-ready `PLAN.md` from the decisions in a confirmed `DISCUSS.md`. It starts with a guard check — if `DISCUSS.md` does not exist or is not confirmed, execution stops and the user is directed to run `/fd-discuss` first.

After loading context (`PROJECT.md`, `STATE.md`, `DISCUSS.md`), `@planner` creates a wave-structured `PLAN.md` where every task traces back to a `D-XX` decision. The draft plan is then handed to `@plan-checker`, which scores it for completeness, feasibility, and testability.

A FAIL verdict from `@plan-checker` returns the plan to `@planner` for revision. A PASS (or PASS_WITH_NOTES) causes `@orchestrator` to present the plan to the user. Execution **pauses here** — the plan is not saved until the user explicitly confirms it. After confirmation, the plan is saved to `.planning/phases/phase-N/PLAN.md` and `STATE.md` is updated.

**Steps:**
1. `@orchestrator` — Guard check: verify `DISCUSS.md` exists and is confirmed
2. `@orchestrator` — Load `PROJECT.md`, `STATE.md`, `DISCUSS.md`
3. `@planner` — Create `PLAN.md` with tasks traced to D-XX decisions
4. `@plan-checker` — Verify completeness, feasibility, testability; return PASS or FAIL
5. `@orchestrator` — Present draft plan for user review
6. `@orchestrator` — **PAUSE** — wait for explicit user CONFIRM before saving
7. `@orchestrator` — Save confirmed `PLAN.md` to `.planning/phases/phase-N/`
8. `@orchestrator` — Update `STATE.md` with plan file path

---

### plan-phase

**Triggered by:** `/fd-plan-phase [N]`

A focused sub-flow for creating a plan for a specific numbered phase. Unlike `plan-flow`, which drives the full `/fd-plan` command, `plan-phase` is a targeted invocation that takes a phase number as an argument and operates only on that phase's scope.

`@planner` is spawned with the phase's `REQUIREMENTS.md` (or `DISCUSS.md`), `ROADMAP.md`, and `PROJECT.md`. It produces `.planning/phases/phase-N/PLAN.md`. `@plan-checker` then reviews the plan and returns PASS or FAIL with specific recommendations. Results are presented by `@orchestrator`.

**Steps:**
1. `@planner` — Create `PLAN.md` for the specified phase
2. `@plan-checker` — Score plan: completeness, feasibility, testability
3. `@orchestrator` — Present PASS/FAIL verdict and recommendations

---

### execute-flow

**Triggered by:** `/fd-new-feature`

The execute flow drives full feature delivery. A guard check verifies that `.planning/` and `.codebase/` exist and that `PLAN.md` is confirmed — if any check fails, execution stops with a specific message directing the user to the missing prerequisite.

`@orchestrator` loads the active `PLAN.md` and identifies the first incomplete step. If steps are independent, `@coder` agents run in parallel via `@parallel-coordinator`. After each step, `@reviewer` reviews the completed work. `@orchestrator` marks the step complete in `STATE.md`, then advances to the next step. When all steps are complete, `STATE.md` is updated to the `review` phase.

**Steps:**
1. `@orchestrator` — Guard check: verify `.planning/`, `.codebase/`, plan confirmed
2. `@orchestrator` — Load active `PLAN.md`; identify first incomplete step
3. `@coder` — Execute step (parallel if steps are independent)
4. `@reviewer` — Review completed work
5. `@orchestrator` — Mark step complete; advance to next step
6. `@orchestrator` — Loop until all steps complete; update phase to `review`

---

### execute-phase

**Triggered by:** `/execute-phase [N]`

A targeted sub-flow for executing a single numbered phase plan. Before delegating, `@orchestrator` verifies that `.planning/`, `.codebase/`, and `.planning/phases/phase-N/PLAN.md` all exist and that the plan has the `confirmed` status flag.

`@orchestrator` is spawned with `STATE.md`, `PLAN.md`, and `PROJECT.md`. It executes tasks in wave order, committing each atomically. After each task it checkpoints state via the planning-state tool. Deviations from the plan are documented in a `## Deviations` section of `PLAN.md`. After all tasks complete, `@orchestrator` writes `SUMMARY.md` and `@orchestrator` marks the phase complete in `STATE.md` and `ROADMAP.md`.

**Steps:**
1. `@orchestrator` — Verify prerequisites: `.planning/`, `.codebase/`, `PLAN.md` confirmed
2. `@orchestrator` — Load `PLAN.md`, `STATE.md`, `PROJECT.md`
3. `@orchestrator` — Execute tasks in wave order; atomic commit per task
4. `@orchestrator` — Checkpoint state after each task
5. `@orchestrator` — Write `SUMMARY.md`
6. `@orchestrator` — Mark phase complete in `STATE.md` and `ROADMAP.md`

---

### fix-bug-flow

**Triggered by:** `/fd-fix-bug`

A systematic bug fix workflow that guarantees a regression test exists before any fix is applied. `@orchestrator` loads `STATE.md`, `ARCHITECTURE.md`, and `CONVENTIONS.md` to give all agents the project context they need.

`@debug-specialist` reproduces the bug with a minimal case, documenting expected vs actual behavior. `@researcher` assists with root cause investigation by tracing the stack and reading related code. `@tester` writes a failing regression test that reproduces the exact failure — this test must fail before any fix is written. `@coder` then fixes the root cause (not the symptom) with the minimum change that makes the regression test pass. `@reviewer` checks the fix for quality and security regressions. Finally, `@tester` runs the full test suite to confirm everything is green.

**Steps:**
1. `@orchestrator` — Load `STATE.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`
2. `@debug-specialist` — Reproduce bug; document inputs and expected vs actual
3. `@researcher` — Trace stack; identify root cause candidates
4. `@tester` — Write failing regression test
5. `@coder` — Fix root cause; minimum change to make regression test pass
6. `@reviewer` — Review fix for quality and security regressions
7. `@tester` — Run full suite; confirm regression test and all others pass
8. `@orchestrator` — Update `STATE.md` with fix summary

---

### debug-flow

**Triggered by:** `/debug`

A lighter debugging workflow focused on systematic diagnosis without the full bug-fix lifecycle. Where `fix-bug-flow` orchestrates a complete team, `debug-flow` keeps `@debug-specialist` in the lead throughout.

`@debug-specialist` establishes a minimal reproduction case, reads the full stack trace from top to bottom, and traces the execution path backward to identify root cause. `@tester` then writes a failing regression test for the exact failure — not a general test, but one that fails for the specific reason `@debug-specialist` identified. `@coder` applies the minimal fix, and `@tester` verifies by running the regression test plus the full suite.

The cardinal rule of this workflow: never suppress an error to make a test pass. Fix the root cause.

**Steps:**
1. `@debug-specialist` — Establish minimal reproduction case
2. `@debug-specialist` — Trace execution path; identify root cause
3. `@tester` — Write failing regression test for the specific failure
4. `@coder` — Fix root cause with minimal change
5. `@tester` — Run regression test + full suite to confirm

---

### review-code-flow

**Triggered by:** `/fd-review-code`

A parallel code review workflow that combines quality review, security checking, and test coverage verification simultaneously. `@orchestrator` determines the review scope — either from changed files (git diff) or an explicit scope argument.

`@parallel-coordinator` spawns three agents simultaneously: `@reviewer` checks for security vulnerabilities (injection, exposed secrets, missing auth) and code quality issues; `@researcher` provides best-practice context for any flagged areas; `@tester` verifies that changed code has adequate test coverage. All three run in parallel and report independently. `@orchestrator` then aggregates the findings into a unified report sorted by severity: CRITICAL → HIGH → MEDIUM → PASS.

**Steps:**
1. `@orchestrator` — Identify review scope (changed files or explicit argument)
2. `@parallel-coordinator` — Spawn in parallel:
   - `@reviewer` — security vulnerabilities and code quality
   - `@researcher` — best-practice context for flagged areas
   - `@tester` — test coverage for changed code
3. `@orchestrator` — Aggregate all findings by severity into unified report

---

### deploy-check-flow

**Triggered by:** `/fd-deploy-check`

A comprehensive pre-deployment check suite that runs four independent checks simultaneously and produces a single GO/NO-GO decision. Any CRITICAL or HIGH finding from any check produces NO-GO.

`@parallel-coordinator` launches all four checks at once: the full test suite (all tests pass, no unexplained skips), a security scan via `@security-auditor` (OWASP Top 10 on changed files), a CVE audit on dependencies, and a clean build verification. `@orchestrator` waits for all four to complete, aggregates the results, and produces the final GO or NO-GO verdict. A NO-GO includes a specific list of required fixes before the deployment can be retried.

**Steps:**
1. `@parallel-coordinator` — Run simultaneously:
   - Full test suite
   - Security scan (`@security-auditor`)
   - CVE dependency audit
   - Build verification
2. `@orchestrator` — Aggregate all results
3. `@orchestrator` — Produce GO/NO-GO decision; list required fixes if NO-GO

---

### refactor-flow

**Triggered by:** `/refactor`

A disciplined safe-refactoring workflow where the test suite must be green before the first line of code changes, and must stay green after every single transformation. No feature additions are permitted during a refactoring session.

`@tester` runs the suite and confirms it is green. If it is not green, the workflow stops — tests must be fixed before refactoring begins. `@mapper` reads the codebase and identifies refactoring candidates (large files, duplication, high complexity). `@refactor-guide` produces a list of specific transforms ordered from lowest to highest risk. `@coder` applies one transform, then `@tester` verifies the suite is still green. `@orchestrator` commits each transform separately with a `refactor:` prefix message. The loop repeats until all planned transforms are complete.

**Steps:**
1. `@tester` — Run suite; confirm green before any changes
2. `@mapper` — Identify refactoring candidates
3. `@refactor-guide` — List transforms in low-to-high risk order
4. Loop:
   - `@coder` — Apply one transform
   - `@tester` — Verify suite still green; if broken, undo
   - `@orchestrator` — Commit with `refactor:` message

---

### write-docs-flow

**Triggered by:** `/fd-write-docs`

A documentation workflow that prioritizes accuracy over speed — every piece of documentation is verified against the actual code before it is finalized. The flow starts with exploration rather than writing.

`@code-explorer` maps all exported functions, classes, and types in the target scope, identifying public API entry points and key workflows. `@writer` uses that structural map to draft documentation covering API reference, examples, and usage patterns — it reads every source file it documents. `@reviewer` then checks the draft for accuracy against actual code behavior (not plausible-sounding descriptions, actual behavior). `@writer` incorporates reviewer feedback, and `@doc-updater` writes the final output to the appropriate location and ensures no stale references remain.

**Steps:**
1. `@code-explorer` — Map exports, public APIs, and key workflows in scope
2. `@writer` — Draft documentation from code exploration output
3. `@reviewer` — Accuracy check against actual code behavior
4. `@writer` — Revise based on review feedback
5. `@doc-updater` — Write final docs to appropriate location; remove stale references

---

### map-codebase-flow

**Triggered by:** `/fd-map-codebase`

Produces the six `.codebase/` documentation files in parallel using six `@mapper` instances, each assigned to one output file. Before running, `@orchestrator` checks whether `.codebase/` already exists and requires user confirmation before overwriting.

`@orchestrator` creates individual worktrees for each mapper instance to prevent file conflicts, then spawns all six `@mapper` agents simultaneously. Each mapper reads source files directly and writes only its assigned file: `STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, or `CONCERNS.md`. `@orchestrator` waits for all six to complete, then verifies each file exists and contains non-empty content. Worktrees are cleaned up regardless of success or failure.

**Steps:**
1. `@orchestrator` — Check if `.codebase/` exists; warn and require confirmation if present
2. `@orchestrator` — Create worktrees for each mapper instance
3. `@mapper` ×6 — Run in parallel, each writing its assigned `.codebase/` file
4. `@orchestrator` — Wait for all mappers to complete
5. `@orchestrator` — Clean up worktrees
6. `@orchestrator` — Verify all six files exist with non-empty content

**Output files:**

| File | Contents |
|------|---------|
| `.codebase/STACK.md` | Tech stack with exact pinned versions |
| `.codebase/ARCHITECTURE.md` | Component diagram and data flow |
| `.codebase/STRUCTURE.md` | Directory layout with purpose of each directory |
| `.codebase/CONVENTIONS.md` | Naming and coding patterns with file:line examples |
| `.codebase/TESTING.md` | Test frameworks, patterns, and file organization |
| `.codebase/CONCERNS.md` | All TODO, FIXME, and HACK markers found by grep |

---

### parallel-execution-flow

**Triggered by:** `@parallel-coordinator` (invoked from execute-flow or directly)

The parallel execution flow maximizes agent throughput by running independent workstreams simultaneously in waves. It is not triggered by a user command directly — it is invoked when `@orchestrator` or `@execute-flow` determines that parallel execution is appropriate for a plan.

`@parallel-coordinator` reads the active `PLAN.md`, identifies all tasks, and classifies each as blocking (must complete before something else) or independent (can run simultaneously). It then groups tasks into waves and emits a WAVE TABLE before delegating any agents.

The standard wave structure: Wave 1 runs `@researcher` and `@code-explorer` simultaneously (discovery); Wave 2 runs `@architect` alone (design, serial, gates Wave 3); Wave 3 runs `@coder` and `@tester` simultaneously (implementation from `@architect`'s contracts); Wave 4 runs `@reviewer` and `@security-auditor` simultaneously (validation). When Wave 3 tracks converge, `@parallel-coordinator` runs a merge protocol to detect and resolve any overlapping file changes.

**Steps:**
1. `@parallel-coordinator` — Read `PLAN.md`; classify tasks as blocking or independent
2. `@parallel-coordinator` — Group into waves; emit WAVE TABLE
3. Wave 1 (parallel): `@researcher` + `@code-explorer`
4. Wave 2 (serial): `@architect` (design from Wave 1 output)
5. Wave 3 (parallel): `@coder` + `@tester` (from `@architect` contracts)
6. `@parallel-coordinator` — Merge Wave 3 outputs; resolve conflicts
7. Wave 4 (parallel): `@reviewer` + `@security-auditor`

**WAVE TABLE format:**
```
╔══════════════════════════════════════════════════════════════╗
║  WAVE TABLE — [Job Title]                                    ║
╠══════════════════════════════════════════════════════════════╣
║  Wave 1 (parallel)  │ @researcher + @code-explorer          ║
║  Wave 2 (serial)    │ @architect                             ║
║  Wave 3 (parallel)  │ @coder + @tester                      ║
║  Wave 4 (parallel)  │ @reviewer + @security-auditor         ║
╠══════════════════════════════════════════════════════════════╣
║  Est. sequential:   │ 8h                                     ║
║  Est. parallel:     │ 4.5h                                   ║
║  Dependency locks:  │ Wave 3 blocked on Wave 2 output        ║
╚══════════════════════════════════════════════════════════════╝
```

---

### multi-repo-flow

**Triggered by:** `/fd-multi-repo`

Orchestrates a feature or fix that spans multiple repositories in a microservice architecture. Ensures changes propagate in the correct dependency order, API contracts are agreed before implementation, and integration is verified end-to-end before any service ships to production.

`@multi-repo-coordinator` reads the sub-repo registry from `.planning/config.json`, verifies all repository paths exist, and loads each service's tech stack. It then builds a dependency graph — which services call which — and classifies the change as breaking or non-breaking. `@architect` writes the contract-first change specification and a per-repo CHANGE PLAN ordered by the dependency graph. `@coder` and `@tester` implement and test changes in each repo in the correct order (upstream before downstream). After all repos are implemented, `@tester` and `@reviewer` run cross-repo integration verification and sign off on each repo before any service is deployed.

**Steps:**
1. `@multi-repo-coordinator` — Read `.planning/config.json`; verify repo paths; load stacks
2. `@multi-repo-coordinator` + `@architect` — Build dependency graph; classify change
3. `@architect` — Write contract-first change spec and ordered per-repo CHANGE PLAN
4. `@coder` + `@tester` — Implement and test in dependency order (upstream first)
5. `@tester` + `@reviewer` — Cross-repo integration tests; sign off per repo

---

← [Back to Index](index.md)
