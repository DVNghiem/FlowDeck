# Configuration

FlowDeck has two levels of configuration: the global OpenCode config (`opencode.json`) and the per-project config (`.planning/config.json`). This document covers both, plus environment variables and the plugin tools that FlowDeck exposes to every OpenCode session.

---

## opencode.json

OpenCode reads `~/.config/opencode/opencode.json` at startup. FlowDeck requires one entry in the `plugin` array and supports optional entries in `instructions` to load rule files.

### Minimal configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@dv.nghiem/flowdeck"]
}
```

The `plugin` entry is written automatically by the FlowDeck installer. If it is missing, agents, skills, and commands will not load.

### Full configuration with rules

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@dv.nghiem/flowdeck"],
  "instructions": [
    ".planning/PROJECT.md",
    "flowdeck-rules/common/coding-style.md",
    "flowdeck-rules/typescript/patterns.md"
  ]
}
```

Files listed under `instructions` are injected into every agent's context at session start. Use this to load project context and language-specific coding standards automatically.

---

## Using Language Rules

FlowDeck installs rule files under the npm package cache path:

```
~/.cache/opencode/packages/@dv.nghiem/flowdeck@latest/rules/
```

To activate rules, reference them by their path in the `instructions` array. Examples for each supported language:

**TypeScript**
```json
"instructions": [
  "flowdeck-rules/common/coding-style.md",
  "flowdeck-rules/common/security.md",
  "flowdeck-rules/common/testing.md",
  "flowdeck-rules/typescript/patterns.md"
]
```

**Python**
```json
"instructions": [
  "flowdeck-rules/common/coding-style.md",
  "flowdeck-rules/common/testing.md",
  "flowdeck-rules/python/patterns.md"
]
```

**Go**
```json
"instructions": [
  "flowdeck-rules/common/coding-style.md",
  "flowdeck-rules/common/git-workflow.md",
  "flowdeck-rules/golang/patterns.md"
]
```

**Java**
```json
"instructions": [
  "flowdeck-rules/common/coding-style.md",
  "flowdeck-rules/common/security.md",
  "flowdeck-rules/java/patterns.md"
]
```

**Rust**
```json
"instructions": [
  "flowdeck-rules/common/coding-style.md",
  "flowdeck-rules/rust/patterns.md"
]
```

**Common rules (all projects)**

| File | Purpose |
|------|---------|
| `flowdeck-rules/common/coding-style.md` | Formatting, naming conventions, comment standards |
| `flowdeck-rules/common/testing.md` | Test structure, coverage targets, assertion patterns |
| `flowdeck-rules/common/security.md` | Input validation, secrets handling, OWASP reminders |
| `flowdeck-rules/common/git-workflow.md` | Branching strategy, commit message format, PR workflow |
| `flowdeck-rules/common/agent-orchestration.md` | How agents hand off context and coordinate work |

---

## Project Config (.planning/config.json)

Each FlowDeck project stores its settings in `.planning/config.json`. This file is created by `/fd-new-project` and updated by `/fd-settings`.

### Full schema

```json
{
  "project_name": "MyApp",
  "workspace_mode": "single",
  "active_phase": 1,
  "plan_confirmed": false,
  "enforce_guardrails": true,
  "sub_repos": [
    {
      "name": "user-service",
      "path": "../user-service",
      "role": "upstream-api",
      "tech_stack": "node+typescript",
      "owner_team": "platform"
    }
  ]
}
```

### Field reference

| Field | Type | Description |
|-------|------|-------------|
| `project_name` | string | Human-readable name shown in `/fd-dashboard` and state files |
| `workspace_mode` | `"single"` \| `"multi"` | `"single"` for one repo; `"multi"` enables the multi-repo coordinator |
| `active_phase` | integer | The current phase number. `@orchestrator` reads this to determine which plan to execute |
| `plan_confirmed` | boolean | Set to `true` when you type `CONFIRMED` after `/fd-plan`. Guards against unreviewed execution |
| `enforce_guardrails` | boolean | When `true`, the `@plan-checker` must approve a plan before `@orchestrator` runs it |
| `sub_repos` | array | List of additional repositories involved in this project (multi-repo mode only) |
| `sub_repos[].name` | string | Short identifier used in cross-repo task delegation |
| `sub_repos[].path` | string | Relative or absolute path to the repository on disk |
| `sub_repos[].role` | string | Describes the relationship: `"upstream-api"`, `"downstream-consumer"`, `"shared-lib"`, etc. |
| `sub_repos[].tech_stack` | string | Primary language and framework, used by `@multi-repo-coordinator` for context |
| `sub_repos[].owner_team` | string | Informational — used in planning notes and review assignments |

---

## flowdeck.json (Agent Model Overrides)

The `flowdeck.json` file lets you assign specific AI models to individual FlowDeck agents. This is useful when you want the `@planner` to use a more capable model while lighter agents like `@tester` use a faster, cheaper one.

### Locations

| Scope | Path |
|-------|------|
| Global | `~/.config/opencode/flowdeck.json` |
| Project | `<project>/.opencode/flowdeck.json` |

Project config takes precedence over global config.

### Schema

```json
{
  "agents": {
    "<agent-name>": {
      "model": "<provider>/<model-id>"
    }
  }
}
```

### Supported Agents

| Agent | Default Model | Override Example |
|-------|--------------|-----------------|
| `@architect` | `claude-opus-4-5` | `anthropic/claude-opus-4-5` |
| `@build-error-resolver` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@code-explorer` | `claude-haiku-4-5` | `anthropic/claude-haiku-4-5` |
| `@coder` | `claude-opus-4-5` | `anthropic/claude-opus-4-5` |
| `@debug-specialist` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@discusser` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@doc-updater` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@orchestrator` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@plan-checker` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@planner` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@mapper` | `gemini-2.5-flash` | `google/gemini-2.5-flash` |
| `@multi-repo-coordinator` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@orchestrator` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@parallel-coordinator` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@performance-optimizer` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@planner` | `claude-opus-4-5` | `anthropic/claude-opus-4-5` |
| `@refactor-guide` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@researcher` | `gpt-4o` | `openai/gpt-4o` |
| `@reviewer` | `gemini-2.5-flash` | `google/gemini-2.5-flash` |
| `@security-auditor` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@task-splitter` | `claude-sonnet-4-5` | `anthropic/claude-sonnet-4-5` |
| `@tester` | `claude-haiku-4-5` | `anthropic/claude-haiku-4-5` |
| `@writer` | `claude-haiku-4-5` | `anthropic/claude-haiku-4-5` |

### Example

```json
{
  "agents": {
    "planner": {
      "model": "anthropic/claude-opus-4-5"
    },
    "orchestrator": {
      "model": "anthropic/claude-sonnet-4-5"
    },
    "tester": {
      "model": "anthropic/claude-haiku-4-5"
    }
  }
}
```

### Notes

- If an agent is not listed in `agents`, it uses the model currently selected in OpenCode.
- Only list agents you want to override — omitted agents inherit the session default.
- Model strings must match the format `provider/model-id` (e.g., `anthropic/claude-sonnet-4-5`).

---

## Settings Command

To view or modify project configuration interactively, run inside an OpenCode session:

```
/fd-settings
```

`/fd-settings` displays the current values from `.planning/config.json`, lists active model assignments for each agent, and presents options to:

- Switch `workspace_mode` between `single` and `multi`
- Change the `active_phase`
- Toggle `enforce_guardrails`
- Register or remove sub-repos
- Run `/fd-doctor` to verify environment health

Changes are written back to `.planning/config.json` immediately.

---

## Built-in MCP Servers

FlowDeck automatically registers three free, read-only remote Model Context Protocol (MCP) servers to give your agents extended capabilities:

| MCP | Endpoint | Purpose |
|---|---|---|
| **Context7** | `mcp.context7.com/mcp` | Fast library and API documentation lookup |
| **Exa Websearch** | `mcp.exa.ai/mcp` | General web search capabilities |
| **Grep.app** | `mcp.grep.app` | Global code search across open-source repositories |

These are enabled by default. If you have API keys (e.g., `CONTEXT7_API_KEY`, `EXA_API_KEY`), FlowDeck will automatically inject them. To disable any of these, use the `FLOWDECK_DISABLE_MCP` environment variable (e.g., `FLOWDECK_DISABLE_MCP=context7,websearch`).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_CONFIG_DIR` | `~/.config/opencode` | Override the directory where FlowDeck looks for agents, skills, and commands |
| `XDG_CONFIG_HOME` | `~/.config` | Standard XDG base directory; used to resolve `OPENCODE_CONFIG_DIR` when not explicitly set |
| `FLOWDECK_CONTEXT_LIMIT` | `200000` | Token limit used by the Context Window Monitor to warn when context usage exceeds 70% |
| `FLOWDECK_DISABLE_MCP` | (empty) | Comma-separated list of remote MCPs to disable. Valid options: `context7`, `websearch`, `grep_app` |
| `FLOWDECK_ORCHESTRATOR_GUARD` | `off` | Enable the orchestrator guard hook. When `on`, the orchestrator session cannot use write/bash tools directly and must delegate all implementation work. |
| `TELEMETRY_ENABLED` | `false` | Enable telemetry events from `run-parallel` and hooks. When `true`, events are written to `.codebase/TELEMETRY.jsonl`. |

---

## FlowDeck Plugin Tools

When the `@dv.nghiem/flowdeck` plugin is loaded, six tools become available to every agent in your OpenCode session. You do not need to invoke these directly — they are used automatically by FlowDeck agents and workflows.

| `planning-state` | Read and write `.planning/` state files (`STATE.md`, `PLAN.md`, `DISCUSS.md`, `config.json`). Used by every agent that needs project context. |
| `codebase-state` | Read `.codebase/` documentation files generated by `@mapper`. Gives agents access to `STACK.md`, `ARCHITECTURE.md`, and `CONVENTIONS.md`. |
| `workspace-state` | Read workspace and multi-repo metadata. Returns the current project config, sub-repo list, and active phase. |
| `run-parallel` | Fan out a set of independent agent tasks simultaneously. Used by `@parallel-coordinator` to execute wave tasks concurrently. |
| `run-pipeline` | Execute a sequence of agent tasks in strict order, passing each step's output as input to the next. Used by `@orchestrator` for ordered workflows. |
| `delegate` | Invoke a specific named agent with a given prompt and context. The core primitive used by orchestration agents to hand off work. |
| `hash-edit` | Reliable file editing with content verification. Takes target content and its expected hash to prevent edits on stale versions. |
| `council` | Ensemble-based reasoning. Runs 3 specialized agents in parallel and synthesizes their consensus for complex decisions. |
| `context-generator` | Auto-generate/update hierarchical `AGENTS.md` and `CLAUDE.md` files throughout the project for better agent grounding. |

---

← [Back to Index](index.md)
