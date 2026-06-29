# FlowDeck

> AI-powered multi-agent workflow orchestration with built-in safety intelligence for OpenCode

FlowDeck structures every feature through an **adaptive workflow cycle**. The orchestrator scores each task and selects the minimal sufficient workflow class dynamically.

## Features

- **24 agents** — architect, planner, coder, reviewer, tester, debugger, risk-analyst, policy-enforcer, and more
- **67 skills** — reusable workflow patterns (TDD, security scan, code review, deploy check, and more)
- **23 commands** — workflow commands for all project operations
- **Adaptive workflow routing** — scores tasks across 5 dimensions and selects the minimal sufficient workflow
- **Persistent state** — resume exactly where you left off across sessions via `.planning/STATE.md`
- **Parallel execution** — independent tasks run simultaneously in wave-structured batches
- **AI Safety layer** — patch trust scoring, edit gates, phase gating, regression prediction built into every workflow

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/fd-map-codebase` | Analyse and index the codebase into structured `.codebase/` files |
| `/fd-new-feature` | Define a new feature and initialize feature context |
| `/fd-discuss` | Pre-planning structured Q&A to capture decisions |
| `/fd-plan` | Generate a wave-structured execution plan |
| `/fd-execute` | Implement feature with TDD discipline and parallel agents |
| `/fd-verify` | Full verification pipeline: tests, code review, security scan |
| `/fd-checkpoint` | Save a mid-session checkpoint to STATE.md |
| `/fd-resume` | Reload checkpoint to continue interrupted session |
| `/fd-status` | View project progress and roadmap |
| `/fd-doctor` | Check FlowDeck installation and environment health |
| `/fd-ultrawork` | Maximum-effort autonomous execution (high token cost) |

## Reference

- [Workflow Router API](reference/workflow-router.md) — Adaptive workflow routing API
- [Hooks](reference/hooks.md) — Lifecycle hooks and event interception
- [Rules](reference/rules.md) — Coding standards and behavioral rules

## Concepts

- [Workflows](concepts/workflows.md) — Command cycle, adaptive routing, wave execution, checkpointing
- [Commands](commands/) — Full command documentation
- [Skills](skills/) — Reusable skill definitions

## Next Steps

- [Getting Started → Installation](getting-started/installation.md)
- [Quick Start → First 15 Minutes](getting-started/quick-start.md)
- [First Project → Bootstrap Your First Project](getting-started/first-project.md)
