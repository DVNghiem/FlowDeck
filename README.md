# FlowDeck — OpenCode Plugin

> AI-powered multi-agent workflow orchestration with built-in safety intelligence for OpenCode

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 27 specialist agents through an adaptive cycle — discuss, plan, execute, review — with persistent state that survives session restarts, a configurable governance layer, and tool-selection policies that route work to codegraph, token-optimized readers, web search, and library docs when available.

---

## Features

- 🤖 **27 agents** — orchestrator, planner, architect, backend/frontend coders, tester, reviewer, researcher, security-auditor, risk-analyst, policy-enforcer, performance-optimizer, and more
- 🛠️ **67 skills** — reusable workflow patterns (TDD, security scan, deploy check, code review, and more)
- ⚡ **24 commands** — slash-command entry points for planning, execution, verification, and support
- 📋 **Workflow classes** — `quick`, `standard`, `explore`, `ui-heavy`, `bugfix`, `docs-only`, and `verify-heavy` routing
- 🔄 **Persistent state** — resume exactly where you left off across sessions via `.planning/STATE.md`
- 🔀 **Parallel execution** — independent tasks run simultaneously through the orchestrator
- 🦀 **FDX CLI** — token-optimized Rust CLI tools built and installed automatically:
  `fdx-read`, `fdx-grep`, `fdx-search`, `fdx-outline`, `fdx-tree`, `fdx-ls`, `fdx-impact`, `fdx-diff`, `fdx-git`, `fdx-batch`
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

See [Installation](docs/installation.md) for prerequisites, verification steps, and environment variables.

---

## Core Workflow

FlowDeck structures every feature through an **adaptive workflow cycle**. The orchestrator scores each task across 5 dimensions (simplicity, confidence, risk, codebase familiarity, complexity) and selects the minimal sufficient workflow class:

| Workflow Class | Stages | When Used |
|----------------|--------|-----------|
| `quick` | execute → verify | Simple tasks (< 5 files, low risk) |
| `standard` | plan → execute → verify | Normal implementations |
| `explore` | discuss → plan → execute → verify | Ambiguous or unfamiliar tasks |
| `ui-heavy` | discuss → design → plan → execute → verify | UI/UX-heavy tasks |
| `bugfix` | discuss → fix-bug → verify | Bug fixes |
| `docs-only` | write-docs → verify | Documentation changes |
| `verify-heavy` | plan → execute → verify | High blast radius or sensitive paths |

The default full cycle:

```
/fd-init-deep → /fd-map-codebase → /fd-new-feature → /fd-discuss → /fd-design → /fd-plan → /fd-execute → /fd-verify → /fd-done
```

| Step | Command | What happens |
|------|---------|--------------|
| **Initialize** | `/fd-init-deep` | Create `.planning/STATE.md`, `config.json`, and phase directories |
| **Map** | `/fd-map-codebase` | Analyse and index the codebase into structured `.codebase/` files |
| **Define Feature** | `/fd-new-feature "…"` | Initialize feature context and set the workflow class |
| **Discuss** | `/fd-discuss` | `@discusser` runs structured Q&A, saves decisions to `DISCUSS.md` |
| **Design** | `/fd-design` | `@design` produces UI artifacts — wireframes, visual system, approval gate |
| **Plan** | `/fd-plan` | `@planner` builds a `PLAN.md`; you confirm before execution |
| **Execute** | `/fd-execute` | `@orchestrator` delegates to specialist agents via TDD |
| **Done** | `/fd-done` | Mark complete — validates readiness, finalizes state, refreshes mapping |
| **Verify** | `/fd-verify` | Full test suite, code review, security scan, and deploy check |

State is written to `.planning/STATE.md` after each phase. Use `/fd-checkpoint` to save mid-session and `/fd-resume` to reload context in a new session.

---

## Command Reference

### Workflow commands

| Command | Purpose |
|---------|---------|
| `/fd-init-deep` | Initialize `.planning/` workspace for the project |
| `/fd-map-codebase` | Analyse and index the codebase into structured `.codebase/` files |
| `/fd-new-feature` | Define a new feature and initialize feature context |
| `/fd-discuss` | Pre-planning structured Q&A to capture decisions |
| `/fd-design` | Design-first workflow for UI-heavy tasks |
| `/fd-plan` | Generate an execution plan from decisions |
| `/fd-execute` | Implement feature with TDD discipline and parallel agents |
| `/fd-done` | Mark feature/phase complete and refresh mapping |
| `/fd-verify` | Full verification pipeline: tests, review, security scan, deploy check |
| `/fd-fix-bug` | Diagnose, fix, and verify a bug with regression test |
| `/fd-write-docs` | Explore APIs and generate accurate documentation |
| `/fd-deploy-check` | Pre-change release safety checks and review routing |
| `/fd-status` | View project progress, roadmap, and workspace overview |
| `/fd-checkpoint` | Save a session checkpoint to `STATE.md` |
| `/fd-resume` | Reload `STATE.md` and `PLAN.md` to continue an interrupted session |
| `/fd-reflect` | Post-session reflection or capture patterns as reusable skills |
| `/fd-retrospective` | Capture lessons from a completed task to `.flowdeck/lessons.md` |
| `/fd-multi-repo` | Multi-repo orchestration — list, add, remove, or status |
| `/fd-translate-intent` | Convert vague requests into ranked implementation options with tradeoffs |
| `/fd-suggest` | Combined opportunity and risk analysis (impact, volatility, failures, skill gaps) |
| `/fd-ask` | Route a focused question to the appropriate specialist agent |
| `/fd-doctor` | Check FlowDeck installation and environment health |
| `/fd-merge-assist` | Human-in-the-loop selective merge between branches |
| `/fd-ultrawork` | Maximum-effort autonomous execution with deep research + perfection loop (high token cost) |

See [docs/workflows.md](docs/workflows.md) for details on how commands work.

---

## UltraWork Mode

`/fd-ultrawork <task description>` runs FlowDeck at maximum effort — deep research, full planning, TDD execution, full verification, and an evaluate-and-retry loop until done criteria are met. Use it when the result matters more than the cost; do not use it for routine work.

> ⚠️ **Cost warning** — token consumption is significantly higher than any other command. Every run performs mandatory research, multiple verification passes, and may iterate on failures. Only invoke when the task justifies the spend.

**Fixed phases** — `Research → Discuss → Plan → Execute → Verify → Evaluate (loop) → Done`. Phases cannot be skipped to save tokens.

**State** — every run persists to `.planning/ultrawork/` (`RESEARCH.md`, `STATE.md`, `PLAN.md`, `ITERATIONS.md`, `REPORT.md`). Use `/fd-resume` to continue an interrupted run.

**When to use:** hard, high-stakes, or unfamiliar problems where a thorough answer is worth the cost — greenfield architecture, security-sensitive refactors, complex multi-file changes with ambiguous acceptance criteria.

**When NOT to use:** routine edits, docs updates, single-file fixes, anything you'd run through the orchestrator or `/fd-fix-bug`.

See [docs/commands/fd-ultrawork.md](docs/commands/fd-ultrawork.md) for the full phase specification.

---

## Governance Layer

FlowDeck's governance layer provides scaffolding for trustworthy multi-agent execution. It is configured through `flowdeck.json` and runs as internal runtime services.

| Service | What it does |
|---------|-------------|
| **Agent Contract Registry** | Defines allowed tools, forbidden actions, required inputs, and success criteria for every agent |
| **Agent Validator** | Checks each agent invocation against its contract; mode: `off` / `advisory` / `strict` |
| **Supervisor** | Reviews commands and agents before or after execution |
| **Delegation Budget** | Configurable limits on tool calls, sub-agent delegations, retries, and delegation depth |
| **Deadlock / Loop Detection** | Configurable detection of agent bounce loops, circular delegation, and retry loops |
| **Workflow Scorecard** | Configurable quality scoring for runs across multiple dimensions |

Configure in `flowdeck.json`:

```json
{
  "governance": {
    "validator": { "mode": "advisory" },
    "delegationBudget": { "maxToolCalls": 200, "maxDepth": 8, "maxSameStepRetries": 3 },
    "deadlockDetection": { "enabled": true, "bounceThreshold": 3, "autoStop": false },
    "scorecard": { "enabled": true }
  }
}
```

---

## Model Selection

**FlowDeck does not hardcode any model.** Every agent uses the model currently selected in OpenCode.

To assign a specific model to a specific agent, add it to `flowdeck.json`:

```json
{
  "agents": {
    "planner": { "model": "anthropic/claude-opus-4" },
    "tester":  { "model": "openai/gpt-4o-mini" }
  }
}
```

Agents not listed in `agents` inherit the active OpenCode model. See [Configuration](docs/configuration.md) for the full schema.

---

## Documentation

| File | Description |
|------|-------------|
| [docs/index.md](docs/index.md) | Full documentation table of contents |
| [docs/installation.md](docs/installation.md) | Prerequisites, install methods, verification, and uninstall |
| [docs/quick-start.md](docs/quick-start.md) | First 15 minutes — step-by-step walkthrough |
| [docs/configuration.md](docs/configuration.md) | `opencode.json`, `flowdeck.json`, environment variables, plugin tools |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Full agent and skill usage reference with examples |
| [docs/workflows.md](docs/workflows.md) | Command architecture and workflow patterns |
| [docs/intelligence.md](docs/intelligence.md) | AI safety features: patch trust, volatility map, failure replay, regression prediction |

---

## License

MIT
