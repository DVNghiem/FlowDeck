# FlowDeck — OpenCode Plugin

> AI-powered multi-agent workflow orchestration with built-in safety intelligence for OpenCode

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 24 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state that survives session restarts, a full AI safety layer that scores every change, predicts regressions, and enforces architectural constraints before anything is applied, and a governance layer that validates agent behaviour, traces execution, and measures workflow quality.

---

## Features

- 🤖 **24 agents** — architect, planner, coder, reviewer, tester, debugger, risk-analyst, policy-enforcer, and more
- 🛠️ **67 skills** — reusable workflow patterns (TDD, security scan, deploy check, code review, and more)
- ⚡ **23 commands** — workflow commands for all project operations
- 📋 **15 workflows** — pre-built orchestration flows including Spec-Driven Development (SDD)
- 🔄 **Persistent state** — resume exactly where you left off across sessions via `.planning/STATE.md`
- 🔀 **Parallel execution** — independent tasks run simultaneously in wave-structured batches
- 🦀 **FDX CLI** — token-optimized Rust CLI tools (`fdx-read`, `fdx-grep`, `fdx-outline`, `fdx-git`, and more) built and installed automatically
- 📐 **Language rules** — coding standards for TypeScript, Python, Go, Java, and Rust
- 🗂️ **Multi-repo support** — coordinate changes across multiple repositories in one session
- 🔔 **System notifications** — desktop alerts when long-running tasks complete
- 🛡️ **AI Safety layer** — patch trust scoring, edit gates, phase gating, arch constraint enforcement, failure replay, and regression prediction built into every workflow
- 🔍 **Governance layer** — capability contracts, agent validator, inter-agent trace graph, delegation budget, deadlock/loop detector, and workflow scorecard
- 🪝 **Deep System Hooks** — context window monitoring, session idle summaries, shell environment injection, and structured compaction to prevent context loss
- 🌐 **Built-in MCPs** — Context7 (docs), Exa (web search), and Grep.app (code search) included and enabled by default
- 💎 **Ensemble Reasoning** — `council` tool for synthesized consensus from multiple specialized agents
- 🗺️ **Codegraph Integration** — Codegraph-backed code understanding maps the codebase at indexing time and serves as the shared intelligence layer for all commands and agents.
- 🧭 **Adaptive Workflow Routing** — scores tasks across 5 dimensions (complexity, risk, confidence, blast radius, codebase freshness) and selects the minimal sufficient workflow class dynamically
- ⚙️ **Model-agnostic** — no model is hardcoded. Every agent uses your currently selected OpenCode model. Override per-agent in `flowdeck.json`.
- 💰 **Cost Optimization** — USD cost estimation (40+ models), per-workflow budget enforcement, retry-cost tracking, and concurrency limits to control total production spend.

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

The default six-step cycle:

```
/fd-map-codebase → /fd-new-feature → /fd-discuss → /fd-design → /fd-plan → /fd-execute → /fd-verify → /fd-done
```

| Step | Command | What happens |
|------|---------|--------------|
| **Map** | `/fd-map-codebase` | Analyses and indexes the codebase into structured `.codebase/` files |
| **Define Feature** | `/fd-new-feature "…"` | Initialize feature context, creates `FEATURE.md` in current phase |
| **Discuss** | `/fd-discuss` | `@discusser` runs structured Q&A, saves decisions to `DISCUSS.md` |
| **Design** | `/fd-design` | `@design` produces UI artifacts — wireframes, visual system, approval gate |
| **Plan** | `/fd-plan` | `@planner` builds a wave-structured `PLAN.md`; you type `CONFIRM` to proceed |
| **Execute** | `/fd-execute` | `@orchestrator` delegates to `@architect`, `@backend-coder`, `@tester`, `@reviewer` via TDD |
| **Done** | `/fd-done` | Mark complete — validates readiness, finalizes state, refreshes mapping |
| **Verify** | `/fd-verify` | Full test suite, code review, security scan, and deploy check |

State is written to `.planning/STATE.md` after each phase. Use `/fd-checkpoint` to save mid-session and `/fd-resume` to reload context in a new session.

---

## Command Reference

### Workflow commands

| Command | Purpose |
|---------|---------|
| `/fd-map-codebase` | Analyse and index the codebase into structured `.codebase/` files |
| `/fd-new-feature` | Define a new feature and initialize feature context |
| `/fd-discuss` | Pre-planning structured Q&A to capture decisions |
| `/fd-design` | Design-first workflow for UI-heavy tasks — draft, review, or define design system rules |
| `/fd-plan` | Generate a wave-structured execution plan from decisions |
| `/fd-execute` | Implement feature with TDD discipline and parallel agents |
| `/fd-done` | Mark feature/phase complete — validates readiness, finalizes state, refreshes mapping |
| `/fd-verify` | Full verification pipeline: tests, code review, security scan, deploy check |
| `/fd-fix-bug` | Diagnose, fix, and verify a bug with regression test |
| `/fd-write-docs` | Explore APIs and generate accurate documentation |
| `/fd-deploy-check` | Pre-change release safety checks and review routing |
| `/fd-status` | View project progress, roadmap, and workspace overview |
| `/fd-checkpoint` | Save a session checkpoint to STATE.md |
| `/fd-resume` | Reload STATE.md and PLAN.md to continue interrupted session |
| `/fd-reflect` | Post-session reflection or capture patterns as reusable skills |
| `/fd-multi-repo` | Multi-repo orchestration — list, add, remove, or status |
| `/fd-translate-intent` | Convert vague requests into ranked implementation options with tradeoffs |
| `/fd-suggest` | Combined opportunity and risk analysis (impact, volatility, failures, skill gaps) |
| `/fd-ask` | Smart agent dispatch — routes to specialist by keyword |
| `/fd-doctor` | Check FlowDeck installation and environment health |
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
