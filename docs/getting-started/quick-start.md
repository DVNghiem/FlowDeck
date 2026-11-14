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

The task command saves requirements and inline steps in
`~/.fd-plan/<slug>/<topic>/task.md`. STANDARD adds `affect.md` when the change
crosses files; FULL also creates `architecture.md` and `plan.md`.
`<slug>` includes a 12-character hash of the canonical project path for new
workspaces; see [Installation](installation.md) for legacy state behavior.

The project's `~/.fd-plan/<slug>/STATE.md` is created or updated with the active topic and pipeline position.

## Step 4: Review the Plan

```
/fd-review
```

Reviews the tier-appropriate plan and gates it for execution. On pass,
`plan_confirmed: true` is written to `STATE.md`.

## Step 5: Execute

```
/fd-execute
```

Implements the inline steps or FULL `plan.md` with TDD. When FDX is available,
its graph can help map dependencies; otherwise the agent inspects the repository
directly and labels graph findings unavailable.

For a FULL plan with `affect.md`, parallel work is allowed only when file lists
do not intersect. Steps follow `BEHAVIOR → RED → GREEN → REFACTOR` where TDD applies.

After each wave, `~/.fd-plan/<slug>/checkpoint.json` is updated.

## Step 6: Verify

```
/fd-verify
```

Runs relevant tests and tier-appropriate review. On pass, `verification: verified`
is written to `STATE.md`, separately from task `status`.

## Step 7: Done

```
/fd-done
```

Summarizes built versus required and records `status: complete`. It does not
commit or push without a separate explicit instruction.

## What to Expect

After completing the full pipeline you will have:

- A `~/.fd-plan/<slug>/` directory with project state
- A `<topic>/` subdirectory with `task.md` and any artifacts required by the task tier
- Working code with tests
- Verification results in `STATE.md` and `~/.fd-plan/<slug>/.codebase/VERIFICATION.jsonl`
- A verification verdict and completion summary

## Next Steps

- [First Project → End-to-End Walkthrough](first-project.md) — see what the output files actually look like
- [Concepts → Workflows](../concepts/workflows.md) — full pipeline reference with state transitions
