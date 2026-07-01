# FlowDeck

> Structured planning and execution workflows for OpenCode

FlowDeck structures every feature through an **adaptive workflow cycle**. The orchestrator scores each task and selects the minimal sufficient workflow class dynamically.

## Features

- **27 agents** — orchestrator, planner, architect, backend/frontend coders, tester, reviewer, researcher, security-auditor, risk-analyst, policy-enforcer, performance-optimizer, and more
- **67 skills** — reusable workflow patterns (TDD, security scan, code review, deploy check, and more)
- **24 commands** — slash-command entry points for planning, execution, verification, and support
- **Adaptive workflow routing** — scores tasks across 5 dimensions and selects the minimal sufficient workflow
- **Persistent state** — resume exactly where you left off across sessions via `.planning/STATE.md`
- **Parallel execution** — independent tasks run simultaneously through the orchestrator
- **AI safety scaffolding** — patch trust scoring, edit gates, phase gating, and regression prediction built into selected workflows
- **FDX CLI** — token-optimized Rust tools: `fdx-read`, `fdx-grep`, `fdx-search`, `fdx-outline`, `fdx-tree`, `fdx-ls`, `fdx-impact`, `fdx-diff`, `fdx-git`, `fdx-batch`
- **MCP-aware integrations** — uses codegraph, Exa (web search), Grep.app, Context7, and token-optimizer MCPs when registered

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/fd-init-deep` | Initialize `.planning/` workspace for the project |
| `/fd-map-codebase` | Analyse and index the codebase into structured `.codebase/` files |
| `/fd-new-feature` | Define a new feature and initialize feature context |
| `/fd-discuss` | Pre-planning structured Q&A to capture decisions |
| `/fd-plan` | Generate an execution plan from decisions |
| `/fd-execute` | Implement feature with TDD discipline and parallel agents |
| `/fd-verify` | Full verification pipeline: tests, code review, security scan |
| `/fd-checkpoint` | Save a mid-session checkpoint to STATE.md |
| `/fd-resume` | Reload checkpoint to continue interrupted session |
| `/fd-status` | View project progress and roadmap |
| `/fd-doctor` | Check FlowDeck installation and environment health |
| `/fd-ask` | Route a focused question to the appropriate specialist agent |
| `/fd-merge-assist` | Human-in-the-loop selective merge between branches |
| `/fd-retrospective` | Capture lessons from a completed task |
| `/fd-ultrawork` | Maximum-effort autonomous execution (high token cost) |

See [Commands](commands/) for the full command reference.

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

## Next Steps

- [Getting Started → Installation](getting-started/installation.md)
- [Quick Start → First 15 Minutes](getting-started/quick-start.md)
- [First Project → Bootstrap Your First Project](getting-started/first-project.md)
