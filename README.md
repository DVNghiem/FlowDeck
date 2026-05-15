# FlowDeck — OpenCode Plugin

> AI-powered multi-agent workflow orchestration with built-in safety intelligence for OpenCode

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 25 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state that survives session restarts, a full AI safety layer that scores every change, predicts regressions, and enforces architectural constraints before anything is applied, and a governance layer that validates agent behaviour, traces execution, and measures workflow quality.

---

## Features

- 🤖 **25 agents** — architect, planner, coder, reviewer, tester, debugger, risk-analyst, policy-enforcer, and more
- 🛠️ **59 skills** — reusable workflow patterns (TDD, security scan, deploy check, code review, and more)
- ⚡ **20 commands** — workflow commands for all project operations
- 📋 **15 workflows** — pre-built orchestration flows including Spec-Driven Development (SDD)
- 🔄 **Persistent state** — resume exactly where you left off across sessions via `.planning/STATE.md`
- 🔀 **Parallel execution** — independent tasks run simultaneously in wave-structured batches
- 📐 **Language rules** — coding standards for TypeScript, Python, Go, Java, and Rust
- 🗂️ **Multi-repo support** — coordinate changes across multiple repositories in one session
- 🔔 **System notifications** — desktop alerts when long-running tasks complete
- 🛡️ **AI Safety layer** — patch trust scoring, edit gates, phase gating, arch constraint enforcement, failure replay, and regression prediction built into every workflow
- 🔍 **Governance layer** — capability contracts, agent validator, inter-agent trace graph, delegation budget, deadlock/loop detector, and workflow scorecard
- 🪝 **Deep System Hooks** — context window monitoring, session idle summaries, shell environment injection, and structured compaction to prevent context loss
- 🌐 **Built-in MCPs** — Context7 (docs), Exa (web search), and Grep.app (code search) included and enabled by default
- 💎 **Ensemble Reasoning** — `council` tool for synthesized consensus from multiple specialized agents
- 🧠 **Persistent Memory** — SQLite-based memory stores tool executions, assistant messages, and session summaries. Agents can search past observations with `memory-search` tool.
- ⚙️ **Model-agnostic** — no model is hardcoded. Every agent uses your currently selected OpenCode model. Override per-agent in `flowdeck.json`.

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

FlowDeck structures every feature through a six-step cycle:

```
/fd-new-project → /fd-new-feature → /fd-discuss → /fd-plan → /fd-execute → /fd-verify
```

| Step | Command | What happens |
|------|---------|--------------|
| **Setup** | `/fd-new-project MyApp` | Creates `.planning/` directory with `PROJECT.md`, `STATE.md`, and `ROADMAP.md` |
| **Define Feature** | `/fd-new-feature "…"` | Initialize feature context, creates `FEATURE.md` in current phase |
| **Discuss** | `/fd-discuss` | `@discusser` runs structured Q&A, saves decisions to `DISCUSS.md` |
| **Plan** | `/fd-plan` | `@planner` builds a wave-structured `PLAN.md`; you type `CONFIRM` to proceed |
| **Execute** | `/fd-execute` | `@orchestrator` delegates to `@architect`, `@backend-coder`, `@tester`, `@reviewer` via TDD |
| **Verify** | `/fd-verify` | Full test suite, code review, security scan, and deploy check |

State is written to `.planning/STATE.md` after each phase. Use `/fd-checkpoint` to save mid-session and `/fd-resume` to reload context in a new session.

---

## Command Reference

### Workflow commands

| Command | Purpose |
|---------|---------|
| `/fd-new-project` | Bootstrap a new project with PROJECT.md, ROADMAP.md, STATE.md |
| `/fd-map-codebase` | Analyse and index the codebase into structured `.codebase/` files |
| `/fd-new-feature` | Define a new feature and initialize feature context |
| `/fd-discuss` | Pre-planning structured Q&A to capture decisions |
| `/fd-plan` | Generate a wave-structured execution plan from decisions |
| `/fd-execute` | Implement feature with TDD discipline and parallel agents |
| `/fd-verify` | Full verification pipeline: tests, code review, security scan, deploy check |
| `/fd-fix-bug` | Diagnose, fix, and verify a bug with regression test |
| `/fd-write-docs` | Explore APIs and generate accurate documentation |
| `/fd-deploy-check` | Pre-deploy safety check with test, security, and build verification |
| `/fd-status` | View project progress, roadmap, and workspace overview |
| `/fd-checkpoint` | Save a session checkpoint to STATE.md |
| `/fd-resume` | Reload STATE.md and PLAN.md to continue interrupted session |
| `/fd-reflect` | Post-session reflection or capture patterns as reusable skills |
| `/fd-multi-repo` | Multi-repo orchestration — list, add, remove, or status |
| `/fd-translate-intent` | Convert vague requests into ranked implementation options |
| `/fd-suggest` | Analyze the codebase and suggest high-value feature opportunities |
| `/fd-ask` | Smart agent dispatch — routes to specialist by keyword |
| `/fd-quick` | Focused task with automatic agent selection |
| `/fd-doctor` | Check FlowDeck installation and environment health |

### Analysis commands

These umbrella commands consolidate multiple analysis modules into focused entry points:

| Command | Purpose |
|---------|---------|
| `/fd-translate-intent` | Convert vague requests into ranked implementation options with tradeoffs |
| `/fd-suggest` | Combined opportunity and risk analysis (impact, volatility, failures, and skill gaps) |
| `/fd-deploy-check` | Pre-change release safety checks and review routing |
| `/fd-verify` | Standalone verification for tests, review, and security checks |

See [docs/workflows.md](docs/workflows.md) for details on how analysis commands work.

---

## Governance Layer

FlowDeck's governance layer makes multi-agent execution trustworthy and debuggable. It runs as internal runtime services — no extra commands needed.

| Service | What it does |
|---------|-------------|
| **Agent Contract Registry** | Defines allowed tools, forbidden actions, required inputs, and success criteria for every agent |
| **Agent Validator** | Checks each agent invocation against its contract before and after execution; mode: `off` / `advisory` / `strict` |
| **Inter-Agent Trace Graph** | Records every agent-to-agent delegation as a causal span graph; stored in `.codebase/AGENT_SPANS.jsonl` |
| **Delegation Budget** | Per-run limits on tool calls, sub-agent delegations, retries, and delegation depth; stored in `.codebase/BUDGETS.json` |
| **Deadlock / Loop Detector** | Detects agent bounce loops, circular delegation, step retry loops, and stage stalls; stored in `.codebase/DEADLOCK_SIGNALS.jsonl` |
| **Workflow Scorecard** | 10-dimension quality score for every run (TDD, design-first, approvals, budget efficiency, etc.); stored in `.codebase/SCORECARDS.jsonl` |

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
| [docs/configuration.md](docs/configuration.md) | `opencode.json`, project config, environment variables, plugin tools |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Full agent and skill usage reference with examples |
| [docs/workflows.md](docs/workflows.md) | Command architecture and workflow patterns |
| [docs/intelligence.md](docs/intelligence.md) | AI safety features: patch trust, volatility map, failure replay, regression prediction |

---

## License

MIT
