# FlowDeck — OpenCode Plugin

> AI-powered multi-agent workflow orchestration with built-in safety intelligence for OpenCode

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 25 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state that survives session restarts, and a full AI safety layer that scores every change, predicts regressions, and enforces architectural constraints before anything is applied.

---

## Features

- 🤖 **25 agents** — architect, planner, coder, reviewer, tester, debugger, risk-analyst, policy-enforcer, and more
- 🛠️ **24 skills** — reusable workflow patterns (TDD, security scan, deploy check, code review, and more)
- ⚡ **17 commands** — workflow commands for all project operations
- 📋 **15 workflows** — pre-built orchestration flows including Spec-Driven Development (SDD)
- 🔄 **Persistent state** — resume exactly where you left off across sessions via `.planning/STATE.md`
- 🔀 **Parallel execution** — independent tasks run simultaneously in wave-structured batches
- 📐 **Language rules** — coding standards for TypeScript, Python, Go, Java, and Rust
- 🗂️ **Multi-repo support** — coordinate changes across multiple repositories in one session
- 🔔 **System notifications** — desktop alerts when long-running tasks complete
- 🛡️ **AI Safety layer** — patch trust scoring, edit gates, phase gating, arch constraint enforcement, failure replay, and regression prediction built into every workflow
- 🪝 **Deep System Hooks** — context window monitoring, session idle summaries, shell environment injection, and structured compaction to prevent context loss
- 🌐 **Built-in MCPs** — Context7 (docs), Exa (web search), and Grep.app (code search) included and enabled by default
- 💎 **Ensemble Reasoning** — `/fd-council` tool for synthesized consensus from multiple specialized agents
- 🧠 **Persistent Memory** — SQLite-based memory stores tool executions, assistant messages, and session summaries. Agents can search past observations with `memory-search` tool.

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

See [Installation](docs/installation.md) for prerequisites, verification steps, and environment variables.

---

## Core Workflow

FlowDeck structures every feature through a four-step cycle:

```
/fd-new-project  →  /fd-discuss  →  /fd-plan  →  /fd-new-feature
```

| Step | Command | What happens |
|------|---------|--------------|
| **Initialize** | `/fd-new-project MyApp` | Creates `.planning/` directory with `PROJECT.md`, `STATE.md`, and `ROADMAP.md` |
| **Discuss** | `/fd-discuss 1` | `@discusser` runs structured Q&A, saves decisions to `DISCUSS.md` |
| **Plan** | `/fd-plan 1` | `@planner` builds a wave-structured `PLAN.md`; you type `CONFIRMED` to proceed |
| **Execute** | `/fd-new-feature "…"` | `@orchestrator` delegates to `@architect`, `@coder`, `@tester`, `@reviewer` in waves |

State is written to `.planning/STATE.md` after each phase. Use `/fd-checkpoint` to save mid-session and `/fd-resume` to reload context in a new session.

---

## Command Reference

### Workflow commands

| Command | Purpose |
|---------|---------|
| `/fd-new-project` | Bootstrap a new project with PROJECT.md, ROADMAP.md, STATE.md |
| `/fd-map-codebase` | Analyse and index the codebase into structured `.codebase/` files |
| `/fd-discuss` | Pre-planning structured Q&A to capture decisions |
| `/fd-plan` | Generate a wave-structured execution plan from decisions |
| `/fd-new-feature` | Implement a feature with TDD discipline and parallel agents |
| `/fd-fix-bug` | Diagnose, fix, and verify a bug with regression test |
| `/fd-write-docs` | Explore APIs and generate accurate documentation |
| `/fd-deploy-check` | Pre-deploy safety check with test, security, and build verification |
| `/fd-status` | View project progress, roadmap, and workspace overview |
| `/fd-checkpoint` | Save a session checkpoint to STATE.md |
| `/fd-resume` | Reload STATE.md and PLAN.md to continue interrupted session |
| `/fd-reflect` | Post-session reflection or capture patterns as reusable skills |
| `/fd-multi-repo` | Multi-repo orchestration — list, add, remove, or status |
| `/fd-translate-intent` | Convert vague requests into ranked implementation options |
| `/fd-ask` | Smart agent dispatch — routes to specialist by keyword |
| `/fd-quick` | Focused task with automatic agent selection |
| `/fd-doctor` | Check FlowDeck installation and environment health |

### Analysis commands

These umbrella commands consolidate multiple analysis modules into focused entry points:

| Command | Purpose |
|---------|---------|
| `/fd-translate-intent` | Convert vague requests into ranked implementation options with tradeoffs |
| `/fd-analyze-change` | Combined pre-change analysis (impact, blast radius, regression, test gaps, volatility) |
| `/fd-guarded-edit` | Edit gate returning auto-approve / confirm / review / block |
| `/fd-evaluate-risk` | Standalone risk assessment with confidence score |

See [docs/workflows.md](docs/workflows.md) for details on how analysis commands work.

---

## Documentation

| File | Description |
|------|-------------|
| [docs/index.md](docs/index.md) | Full documentation table of contents |
| [docs/installation.md](docs/installation.md) | Prerequisites, install methods, verification, and uninstall |
| [docs/quick-start.md](docs/quick-start.md) | First 15 minutes — step-by-step walkthrough |
| [docs/configuration.md](docs/configuration.md) | `opencode.json`, project config, environment variables, plugin tools |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Full agent and skill usage reference with examples |
| [docs/workflows.md](docs/workflows.md) | Command architecture and workflow patterns |

---

## License

MIT
