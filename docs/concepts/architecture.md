# Architecture

FlowDeck is a plugin that runs inside OpenCode. It layers a structured multi-agent orchestration system on top of the base OpenCode runtime, contributing commands, specialist agents, runtime services, and event-driven hooks.

## Layering

```
OpenCode
  └── FlowDeck Plugin
        ├── Commands (CLI entry points)
        ├── Agents (24 specialists, delegated by orchestrator)
        ├── Services (governance, intelligence, council)
        └── Hooks (session-start, compaction, shell-env, etc.)
```

**OpenCode** provides the underlying runtime: tool execution, file I/O, shell access, MCP integrations, and the conversation UI.

**FlowDeck** adds the workflow layer on top. It does not replace OpenCode's core — it extends it with opinionated orchestration, persistent state, and AI safety services.

## Four Subsystems

### Commands

Commands are the user-facing entry points. They are registered as slash commands in the OpenCode CLI (e.g., `/fd-map-codebase`, `/fd-new-feature`, `/fd-plan`, `/fd-execute`). Each command:

1. Reads current planning or codebase state
2. Invokes the appropriate specialist agents via the `delegate` or `run-pipeline` tools
3. Writes results back to `.planning/` state files
4. Optionally triggers hooks to react to the state change

Commands are implemented as Markdown templates with frontmatter metadata in `src/commands/`. The plugin loader reads them and registers them at startup.

### Agents

FlowDeck ships 24 specialist agents, each responsible for a narrow domain:

| Agent | Role |
|-------|------|
| `@orchestrator` | Coordinates the workflow; delegates to specialists |
| `@architect` | Designs system structure and component boundaries |
| `@planner` | Breaks features into wave-structured tasks |
| `@coder` | Implements features; follows TDD discipline |
| `@tester` | Writes and maintains tests |
| `@reviewer` | Reviews code quality and style |
| `@debugger` | Diagnoses and fixes failures |
| `@risk-analyst` | Identifies technical risk in plans |
| `@policy-enforcer` | Validates compliance with project rules |
| `@discusser` | Runs structured pre-planning Q&A |
| `@designer` | UI/UX design decisions |
| ... and 15 more | |

The orchestrator is the default agent. All other agents are invoked via the `delegate` tool or `run-pipeline` tool. Every agent inherits the currently active OpenCode model by default; individual agents can be overridden in `flowdeck.json`.

### Services

Services are runtime components that run continuously, not as part of a linear workflow:

- **Governance services** — validate agent contracts, enforce delegation budgets, detect loops, and score workflow quality
- **Intelligence services** — compute patch trust scores, volatility maps, failure replays, and regression predictions
- **Council service** — synthesizes consensus from multiple specialized agents via the `council` tool

Services are invoked by hooks (before/after tool execution) or by commands that need on-demand analysis.

### Hooks

Hooks are event handlers registered with OpenCode's plugin API. FlowDeck registers the following hooks:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session.started` | New session begins | Initialize planning state, load config |
| `session.idle` | Session idle detected | Generate idle summary, auto-learn |
| `experimental.session.compacting` | Context window near full | Compact session state |
| `tool.execute.before` | Before any tool runs | Patch trust, guard rails, telemetry, supervisor preflight |
| `tool.execute.after` | After any tool completes | Telemetry, supervisor post-execution review |
| `file.edited` | File changed on disk | Track file modifications |
| `shell.env` | Shell command runs | Inject FlowDeck state into shell |
| `todo.updated` | Todo list changes | Sync todo state |

## State Flow

State flows through the system in a one-way pipeline:

```
Commands
  │  (invoke agents via delegate / run-pipeline)
  ▼
Agents
  │  (produce artifacts, write state)
  ▼
Services (governance + intelligence)
  │  (validate, score, predict — write to .codebase/)
  ▼
Hooks
  │  (react to tool events, trigger re-entry)
  ▼
State files
  ├── .planning/
  │     STATE.md      — current workflow phase, active feature, checkpoint
  │     PLAN.md       — wave-structured execution plan
  │     PROJECT.md    — project overview and constraints
  │     ROADMAP.md    — feature roadmap
  │     FEATURE.md    — current feature context
  │     DISCUSS.md    — pre-planning decisions
  │     multi-repo/   — multi-repo coordination state
  └── .codebase/
        AGENT_SPANS.jsonl    — causal delegation spans
        BUDGETS.json         — delegation budget consumption
        DEADLOCK_SIGNALS.jsonl — loop/bounce detections
        SCORECARDS.jsonl     — per-run quality scores
        CODEGRAPH.json        — codebase structure index
        VOLATILITY.json       — change-frequency map
```

Commands read from and write to `.planning/`. Services write to `.codebase/`. Hooks read both directories and may trigger re-entry into the command pipeline.

## Model-Agnostic Design

FlowDeck makes no model assumptions. Every agent call passes through the active OpenCode model unless overridden per-agent in `flowdeck.json`:

```json
{
  "agents": {
    "planner": { "model": "anthropic/claude-opus-4" },
    "tester":  { "model": "openai/gpt-4o-mini" }
  }
}
```

Agents not listed inherit the global model. Override at the agent level, not the system level.

## Tool Map

FlowDeck registers these tools for use by agents and commands:

| Tool | Purpose |
|------|---------|
| `planning-state` | Read/write `.planning/STATE.md` |
| `codebase-state` | Read/write `.codebase/` state files |
| `run-pipeline` | Execute a defined pipeline of agent steps |
| `delegate` | Invoke a named specialist agent |
| `council` | Run multiple agents and synthesize consensus |
| `failure-replay` | Reproduce and trace a prior failure |
| `decision-trace` | Record and replay decision rationale |
| `hash-edit` | Compute a content hash for an edit |
| `policy-engine` | Evaluate agent actions against project rules |
| `repo-memory` | Persistent memory across sessions |
| `codegraph` | Query codebase structure from indexed graph |

## Plugin Initialization

On startup, the plugin:

1. Reads `flowdeck.json` from the project directory
2. Registers all slash commands from `src/commands/`
3. Registers all agents from `src/agents/`
4. Registers all hooks with the OpenCode plugin API
5. Registers tools, MCP servers, and skills directories
6. Sets `default_agent` to `orchestrator` if not already configured

The plugin is passive until a user invokes a FlowDeck command or an OpenCode event triggers a hook.
