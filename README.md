# FlowDeck — OpenCode Plugin

> AI-powered multi-agent workflow orchestration with built-in safety intelligence for OpenCode

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 25 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state that survives session restarts, and a full AI safety layer that scores every change, predicts regressions, and enforces architectural constraints before anything is applied.

---

## Features

- 🤖 **25 agents** — architect, planner, coder, reviewer, tester, debugger, risk-analyst, policy-enforcer, and more
- 🛠️ **24 skills** — reusable workflow patterns (TDD, security scan, deploy check, code review, and more)
- ⚡ **24 commands** — 19 workflow commands + 4 umbrella analysis commands + `/fd-ask` smart dispatch
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

---

## Quick Install

### Method 1: curl (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/DVNghiem/flowdeck/main/install.sh | bash
```

### Method 2: npx (no git required)

```bash
npx opencode-flowdeck install
```

### Method 3: Manual

```bash
git clone https://github.com/DVNghiem/flowdeck
cd flowdeck
npm install && npm run build
bash install.sh
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
| **Plan** | `/fd-plan 1` | `@flowdeck-planner` builds a wave-structured `PLAN.md`; you type `CONFIRMED` to proceed |
| **Execute** | `/fd-new-feature "…"` | `@orchestrator` delegates to `@architect`, `@coder`, `@tester`, `@reviewer` in waves |

State is written to `.planning/STATE.md` after each phase. Use `/fd-checkpoint` to save mid-session and `/fd-resume` to reload context in a new session.

---

## Command Reference

### Workflow commands

| Command | Purpose |
|---------|---------|
| `/fd-new-project` | Bootstrap a new project with PROJECT.md, ROADMAP.md, STATE.md |
| `/fd-map-codebase` | Analyse and index the codebase into ARCHITECTURE.md and MEMORY.json |
| `/fd-discuss` | Pre-planning discussion with impact radar integration |
| `/fd-plan` | Generate a wave-structured execution plan |
| `/fd-new-feature` | Implement a feature with failure replay and post-execution recording |
| `/fd-fix-bug` | Fix a bug with impact radar, failure replay, and 7-step workflow |
| `/fd-review-code` | Code review with impact radar and trust scoring |
| `/fd-write-docs` | Generate or update documentation |
| `/fd-deploy-check` | Pre-deploy safety and readiness check |
| `/fd-progress` | View project progress and completion metrics |
| `/fd-checkpoint` | Save a session checkpoint for resumption |
| `/fd-resume` | Resume from a previous checkpoint |
| `/fd-roadmap` | View and update the project roadmap |
| `/fd-dashboard` | Visual progress dashboard |
| `/fd-settings` | Configure FlowDeck settings and execution mode |
| `/fd-multi-repo` | Multi-repo management |
| `/fd-ask` | Smart agent dispatch — routes to the right agent by keyword |
| `/fd-doctor` | Check FlowDeck installation and environment health |
| `/fd-council` | Ensemble-based reasoning from multiple specialized agents |

### Analysis commands

These umbrella commands consolidate the full analysis surface into four focused entry points:

| Command | Purpose |
|---------|---------|
| `/fd-analyze-change` | Pre-change analysis — runs impact radar, blast radius, regression prediction, test gap detection, volatility mapping, and reviewer routing in one report |
| `/fd-guarded-edit` | Edit gate — returns auto-approve / require-confirmation / require-review / block based on policy, trust score, volatility, and arch constraints |
| `/fd-evaluate-risk` | Risk assessment — risk score, confidence, regression categories, approval needed, safer alternatives |
| `/fd-translate-intent` | Intent translator — converts vague requests into 3–5 ranked implementation options with assumptions and clarifying questions |

**Example pre-change workflow:**

```bash
# 1. Understand the intent
/fd-translate-intent --intent "make checkout faster"

# 2. Full pre-change analysis
/fd-analyze-change --change "add Redis cache for checkout queries"

# 3. Gate decision for the specific file
/fd-guarded-edit --file "src/checkout/query.ts" --change "add Redis cache layer"

# 4. Quantified risk estimate
/fd-evaluate-risk --change "add Redis cache for checkout queries" --file "src/checkout/query.ts"
```

The individual analysis commands (`/fd-impact-radar`, `/fd-blast-radius`, `/fd-regression-predict`, `/fd-test-gap`, `/fd-volatility-map`, `/fd-review-route`) remain available for single-purpose use. See [docs/command-migration.md](docs/command-migration.md) for the full migration guide.

---

## Documentation

| File | Description |
|------|-------------|
| [docs/index.md](docs/index.md) | Full documentation table of contents |
| [docs/installation.md](docs/installation.md) | Prerequisites, install methods, verification, and uninstall |
| [docs/quick-start.md](docs/quick-start.md) | First 15 minutes — step-by-step walkthrough |
| [docs/configuration.md](docs/configuration.md) | `opencode.json`, project config, environment variables, plugin tools |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Full agent and skill usage reference with examples |
| [docs/command-migration.md](docs/command-migration.md) | Command map, architecture overview, and migration guide |

---

## License

MIT
