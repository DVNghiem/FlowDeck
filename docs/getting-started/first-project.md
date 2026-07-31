# First Project — End-to-End Walkthrough

This guide walks through implementing a simple feature end-to-end with the current FlowDeck pipeline, showing what the system produces at each step.

## Step 1: Start a Task

```
/fd-task "user authentication"
```

The `@planner` agent produces four artifacts under `~/.fd-plan/<slug>/<topic>/`:

- `task.md` — requirements, acceptance criteria, scope
- `architecture.md` — technical approach and module boundaries
- `affect.md` — predicted affected files and dependency map
- `plan.md` — wave-structured execution plan

The project's `~/.fd-plan/<slug>/STATE.md` is created or updated with the active topic and pipeline position.

## Step 2: Review

```
/fd-review
```

The plan is reviewed before any code is written. The reviewer checks design, scope, and acceptance criteria. On pass, `plan_confirmed: true` is written to `STATE.md` and `gate: design` clears.

If review finds blocking issues, they are listed in `STATE.md` `blockers` and `/fd-execute` is refused until they are resolved.

## Step 3: Execute

```
/fd-execute
```

The plan runs in waves. Before each step, `fdx-status` probes the codegraph index; when fresh, `fdx-context`, `fdx-impact`, `fdx-explore`, and `fdx-trace` map the blast radius.

The parallel guard reads `affect.md` and only allows steps in the same wave to run in parallel if their file lists do not intersect. Wave 1 finishes before Wave 2 starts.

After each wave, `~/.fd-plan/<slug>/checkpoint.json` is updated with the new `current_stage: wave-<N>`. Steps complete in `BEHAVIOR → RED → GREEN → REFACTOR → COMMIT` order.

## Step 4: Verify

```
/fd-verify
```

The full verification pipeline runs:

- **Tests** — the project's test suite (`npm test` / `bun test` / `cargo test` / `pytest` / `go test ./...`)
- **Browser / E2E** — Playwright if configured for a web project
- **Regression on affected files** — every file in `affect.md` must have test coverage; `fdx-impact` finds dependents not listed
- **Code review** (`@reviewer`) — security, quality, TDD discipline, ≥ 80% coverage
- **Security scan** (`@security-auditor`) — no hardcoded secrets, validated inputs, no CRITICAL/HIGH findings

On pass, `status: verified` is written to `STATE.md` and `/fd-done` becomes available. On fail, a rollback offer is presented.

## Step 5: Done

```
/fd-done
```

Summarizes built-vs-required, proposes a Conventional Commits message, and asks before pushing. On confirmation, `STATE.md` becomes `status: complete` and the topic is closed.

## What You Have Now

After completing the full workflow:

```
~/.fd-plan/<slug>/
  STATE.md            — current pipeline position, status, blockers
  architecture.md     — project-level architecture
  CODEBASE_INDEX.md   — persisted codebase map
  checkpoint.json     — last checkpoint (read first by /fd-resume)
  <topic>/
    task.md           — requirements and acceptance criteria
    architecture.md   — feature-level technical approach
    affect.md         — affected files
    plan.md           — wave-structured execution plan
    context.md        — per-topic context
    decisions.md      — per-topic decision log
```

Plus the runtime audit logs under `~/.fd-plan/<slug>/.codebase/`:

```
~/.fd-plan/<slug>/.codebase/
  RUNS.jsonl          — command execution history
  AUDIT.jsonl         — lifecycle and hook events
  VERIFICATION.jsonl  — per-verify verdicts
  AGENT_SPANS.jsonl   — causal agent delegation spans
  DECISIONS.jsonl     — per-step decision ledger
```

You can run `/fd-status` to see the project overview, `/fd-resume` to continue in a new session, or `/fd-task` to start the next feature.
