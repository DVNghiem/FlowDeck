# FlowDeck — OpenCode Plugin

> AI-powered multi-agent workflow orchestration with built-in safety intelligence for OpenCode

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 12 specialist agents through one fixed pipeline — task, review, execute, verify, done — with persistent state that survives session restarts, a configurable governance layer, and tool-selection policies that route work to codegraph, token-optimized readers, web search, and library docs when available.

---

## Features

- 🤖 **12 agents** — orchestrator, planner, architect, backend-coder, frontend-coder, devops, mapper, tester, reviewer, researcher, security-auditor, debug-specialist
- 🛠️ **42 skills** — reusable workflow patterns (TDD, security scan, code review, planning, and more)
- ⚡ **8 commands** — slash-command entry points for the task pipeline: `/fd-task`, `/fd-review`, `/fd-execute`, `/fd-verify`, `/fd-done`, with `/fd-checkpoint`, `/fd-resume`, `/fd-status` for support
- 📋 **One fixed pipeline** — every task runs `/fd-task → /fd-review → /fd-execute → /fd-verify → /fd-done`; no workflow classes or adaptive routing
- 🔄 **Persistent state** — resume exactly where you left off across sessions via `~/.fd-plan/<slug>/STATE.md` and `~/.fd-plan/<slug>/checkpoint.json`
- 🔀 **Parallel execution** — independent tasks run simultaneously through the orchestrator
- � **FDX CLI** — 16 token-optimized Rust tools built and installed automatically:
  `fdx-context`, `fdx-decisions`, `fdx-validate`, `fdx-worktree`, `fdx-read`, `fdx-search`, `fdx-grep`, `fdx-batch`, `fdx-impact`, `fdx-outline`, `fdx-diff`, `fdx-git`, `fdx-ls`, `fdx-tree`, `fdx-test`, `fdx-lint`

  `fdx-read` extracts `.docx` and `.xlsx` files to markdown automatically — use it instead of `read_file` when reading Word/Excel specs.
- 📐 **Language rules** — coding standards for TypeScript, Python, Go, Java, and Rust
- 🗂️ **Multi-repo support** — coordinate changes across multiple repositories in one session
- 🔔 **System notifications** — desktop alerts when long-running tasks complete
- 🛡️ **AI safety scaffolding** — patch trust scoring, edit gates, phase gating, failure replay, and regression prediction built into selected workflows
- 🔍 **Governance scaffolding** — agent contracts, validator mode, supervisor review, delegation budgets, deadlock detection, and workflow scorecards configured through `flowdeck.json`
- 🪝 **OpenCode hooks** — session events, shell environment injection, and guard rails that enforce phase and design constraints
- 🌐 **MCP-aware integrations** — uses codegraph, Exa (web search), Grep.app, Context7, and token-optimizer MCPs when registered

---

## Quick Install

### Method 1: curl (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/DVNghiem/flowdeck/main/install.sh | bash
```

### Method 2: npx (no git required)

```bash
npx @dv.nghiem/flowdeck install
```

See [Installation](docs/getting-started/installation.md) for prerequisites, verification steps, and environment variables.

---

## Core Workflow

FlowDeck structures every feature through one fixed pipeline. There are no workflow classes — every task runs the same five stages:

```
/fd-task → /fd-review → /fd-execute → /fd-verify → /fd-done
```

| Step | Command | What happens |
|------|---------|--------------|
| **Task** | `/fd-task "…"` | Auto-init `~/.fd-plan/<slug>/`, map the codebase, confirm requirements, and save `task.md`, `architecture.md`, `affect.md`, `plan.md` |
| **Review** | `/fd-review` | Two-lens review (CEO + engineering) of the task artifacts before any code is written |
| **Execute** | `/fd-execute` | Implement `plan.md` with the TDD pipeline — parallel worktree guard from `affect.md`, wave-based execution, checkpoint after each wave |
| **Verify** | `/fd-verify` | Run tests, regression-check `affect.md` files, code review, security scan; blocks `/fd-done` on failure |
| **Done** | `/fd-done` | Summarize built vs required, then commit and push on confirmation |

State lives under `~/.fd-plan/<slug>/`. The pipeline writes `STATE.md` after each stage and writes a resumable `checkpoint.json`. Use `/fd-checkpoint` to force-save mid-session and `/fd-resume` to reload context in a new session.

---

## Command Reference

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

See [docs/concepts/workflows.md](docs/concepts/workflows.md) for details on how commands work.

Agents not listed in `agents` inherit the active OpenCode model. See [Configuration](docs/configuration/index.md) for the full schema.

---

## Documentation

| File | Description |
|------|-------------|
| [docs/index.md](docs/index.md) | Full documentation table of contents |
| [docs/getting-started/installation.md](docs/getting-started/installation.md) | Prerequisites, install methods, verification, and uninstall |
| [docs/getting-started/quick-start.md](docs/getting-started/quick-start.md) | First 15 minutes — step-by-step walkthrough |
| [docs/getting-started/first-project.md](docs/getting-started/first-project.md) | Bootstrap your first project with the FlowDeck pipeline |
| [docs/concepts/architecture.md](docs/concepts/architecture.md) | Plugin structure, commands, agents, services, and hooks |
| [docs/concepts/workflows.md](docs/concepts/workflows.md) | Command cycle, adaptive routing, wave execution, and checkpointing |
| [docs/concepts/governance.md](docs/concepts/governance.md) | Agent contracts, validator, supervisor, and scorecards |
| [docs/concepts/intelligence.md](docs/concepts/intelligence.md) | Patch trust, failure replay, and regression prediction |
| [docs/configuration/index.md](docs/configuration/index.md) | `opencode.json`, `flowdeck.json`, environment variables, plugin tools |
| [docs/agents/index.md](docs/agents/index.md) | Agent roster, conventions, and triage labels |

> **Archive note:** historical docs from the v1 era have been removed. The shipped command surface is the eight commands listed above; everything else is internal. Documentation tracks runtime as the source of truth.

---

## License

MIT
