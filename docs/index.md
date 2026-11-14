# FlowDeck

> Structured planning and execution workflows for OpenCode and Claude Code

FlowDeck structures every feature through an **adaptive workflow cycle**. The orchestrator scores each task and selects the minimal sufficient workflow class dynamically.

In paths below, `<slug>` means the normalized project directory name plus a
12-character hash of the canonical repository path. Existing basename-only
state is reused only when `STATE.md` attributes it to this repository; unrelated
or unattributed legacy state is not migrated automatically.

## Features

- **12 agents** — orchestrator, planner, architect, backend-coder, frontend-coder, devops, mapper, tester, reviewer, researcher, security-auditor, debug-specialist
- **42 skills** — reusable workflow patterns (TDD, security scan, code review, planning, and more)
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
| `/fd-task` | Capture requirements from a description or available conversation, then save tier-appropriate artifacts |
| `/fd-review` | Two-lens review (CEO + engineering) of the task artifacts before execution |
| `/fd-execute` | Implement inline steps or `plan.md` with TDD, then checkpoint progress |
| `/fd-verify` | Run tests, regression-check `affect.md` files, code review, security scan; blocks `/fd-done` on failure |
| `/fd-done` | Compare the result with acceptance criteria; no automatic commit or push |

### Support commands

| Command | Purpose |
|---------|---------|
| `/fd-checkpoint` | Force-save session state to `checkpoint.json` and `STATE.md` (normally automatic on `session.idle`) |
| `/fd-resume` | Restore `checkpoint.json` (falling back to `STATE.md`), PAUSE for confirmation, continue the recorded command and stage |
| `/fd-status` | Show the current pipeline stage, artifact status, and blockers for the active topic |

See [Commands](commands/) for full command documentation.

For Claude Code, validate and load `integrations/claude-code/` as described in
[Installation](getting-started/installation.md). Claude uses namespaced commands,
for example `/flowdeck:fd-task`.

## Reference

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

