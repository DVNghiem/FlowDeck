# Quick Start — First 15 Minutes

Get FlowDeck installed and run your first feature through the pipeline in under 15 minutes.

## Step 1: Install FlowDeck

```bash
curl -fsSL https://raw.githubusercontent.com/DVNghiem/flowdeck/main/install.sh | bash
```

See [Installation](installation.md) for alternative install methods.

## Step 2: Verify Installation

```bash
flowdeck doctor
```

Checks that FlowDeck is installed, the OpenCode plugin is loaded, and your environment is ready.

## Step 3: Start a Task

```
/fd-task "hello world API"
```

The `@planner` agent produces the four planning artifacts under `~/.fd-plan/<slug>/<topic>/`:

- `task.md` — requirements, acceptance criteria, scope
- `architecture.md` — technical approach and module boundaries
- `affect.md` — predicted affected files
- `plan.md` — wave-structured execution plan

The project's `~/.fd-plan/<slug>/STATE.md` is created or updated with the active topic and pipeline position.

## Step 4: Review the Plan

```
/fd-review
```

Reviews `plan.md` and gates it for execution. On pass, `plan_confirmed: true` is written to `STATE.md`.

## Step 5: Execute

```
/fd-execute
```

Implements the plan in waves. Before each step, `fdx-status` probes the codegraph index; when fresh, `fdx-context`, `fdx-impact`, `fdx-explore`, and `fdx-trace` map the blast radius.

The parallel guard reads `affect.md` and only allows steps in the same wave to run in parallel if their file lists do not intersect. Steps complete in `BEHAVIOR → RED → GREEN → REFACTOR → COMMIT` order.

After each wave, `~/.fd-plan/<slug>/checkpoint.json` is updated.

## Step 6: Verify

```
/fd-verify
```

Runs the full verification pipeline — tests, browser tests, regression on affected files, code review, security scan. On pass, `status: verified` is written to `STATE.md`.

## Step 7: Done

```
/fd-done
```

Summarizes built-vs-required, proposes a Conventional Commits message, asks before pushing. On confirmation, `STATE.md` becomes `status: complete`.

## What to Expect

After completing the full pipeline you will have:

- A `~/.fd-plan/<slug>/` directory with project state
- A `<topic>/` subdirectory with `task.md`, `architecture.md`, `affect.md`, `plan.md`
- Working code with tests
- Verification results in `STATE.md` and `~/.fd-plan/<slug>/.codebase/VERIFICATION.jsonl`
- A commit ready to push

## Next Steps

- [First Project → End-to-End Walkthrough](first-project.md) — see what the output files actually look like
- [Concepts → Workflows](../concepts/workflows.md) — full pipeline reference with state transitions
