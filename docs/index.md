# FlowDeck

> Structured planning and execution workflows for OpenCode

FlowDeck structures every feature through an **adaptive workflow cycle**. The orchestrator scores each task and selects the minimal sufficient workflow class dynamically.

## Features

- **12 agents** — orchestrator, planner, architect, backend-coder, frontend-coder, devops, mapper, tester, reviewer, researcher, security-auditor, debug-specialist
- **41 skills** — reusable workflow patterns (TDD, security scan, code review, planning, and more)
- **8 commands** — slash-command entry points for the task pipeline: `/fd-task`, `/fd-review`, `/fd-execute`, `/fd-verify`, `/fd-done`, with `/fd-checkpoint`, `/fd-resume`, `/fd-status` for support
- **Adaptive workflow routing** — scores tasks across 5 dimensions and selects the minimal sufficient workflow class
- **Persistent state** — resume exactly where you left off across sessions via `~/.fd-plan/<slug>/STATE.md` and `~/.fd-plan/<slug>/checkpoint.json`
- **Parallel execution** — independent tasks run simultaneously through the orchestrator
- **AI safety scaffolding** — patch trust scoring, edit gates, phase gating, and regression prediction built into selected workflows
- **FDX CLI** — 16 token-optimized Rust tools: `fdx-context`, `fdx-decisions`, `fdx-validate`, `fdx-worktree`, `fdx-read`, `fdx-search`, `fdx-grep`, `fdx-batch`, `fdx-impact`, `fdx-outline`, `fdx-diff`, `fdx-git`, `fdx-ls`, `fdx-tree`, `fdx-test`, `fdx-lint`
- **MCP-aware integrations** — uses codegraph, Exa (web search), Grep.app, Context7, and token-optimizer MCPs when registered

## Quick Reference

### Pipeline commands

| Command | Purpose |
|---------|---------|
| `/fd-task` | Auto-init `~/.fd-plan/<slug>/`, map the codebase, confirm requirements, and save `task.md`, `architecture.md`, `affect.md`, `plan.md` |
| `/fd-review` | Two-lens review (CEO + engineering) of the task artifacts before execution |
| `/fd-execute` | Implement `plan.md` with the TDD pipeline — parallel worktree guard from `affect.md`, wave-based execution, checkpoint after each wave |
| `/fd-verify` | Run tests, regression-check `affect.md` files, code review, security scan; blocks `/fd-done` on failure |
| `/fd-done` | Summarize built vs required, then commit and push on confirmation |

### Support commands

| Command | Purpose |
|---------|---------|
| `/fd-checkpoint` | Force-save session state to `checkpoint.json` and `STATE.md` (normally automatic on `session.idle`) |
| `/fd-resume` | Restore `checkpoint.json` (falling back to `STATE.md`), PAUSE for confirmation, continue the recorded command and stage |
| `/fd-status` | Show the current pipeline stage, artifact status, and blockers for the active topic |

See [Commands](commands/) for full command documentation.

## Reference

- [Workflow Router API](reference/workflow-router.md) — Adaptive workflow routing API
- [Hooks](reference/hooks.md) — Lifecycle hooks and event interception
- [Rules](reference/rules.md) — Coding standards and behavioral rules
- [Governance](concepts/governance.md) — Agent contracts, validator, supervisor, and scorecards
- [Intelligence](concepts/intelligence.md) — Patch trust, failure replay, and regression prediction

## Concepts

- [Workflows](concepts/workflows.md) — Command cycle, adaptive routing, wave execution, checkpointing
- [Architecture](concepts/architecture.md) — Plugin structure, commands, agents, services, hooks
- [Commands](commands/) — Full command documentation
- [Skills](skills/) — Reusable skill definitions
- [Agents](agents/) — Agent roster, conventions, and triage labels

## Next Steps

- [Getting Started → Installation](getting-started/installation.md)
- [Quick Start → First 15 Minutes](getting-started/quick-start.md)
- [First Project → Bootstrap Your First Project](getting-started/first-project.md)

