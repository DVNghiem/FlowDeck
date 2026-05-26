# Configuration

FlowDeck is configured via the OpenCode configuration file at `~/.config/opencode/opencode.json` (or `$OPENCODE_CONFIG_DIR/opencode.json`). This file is managed by FlowDeck's `postinstall` script — the plugin is registered automatically when you install FlowDeck.

> **Note:** FlowDeck uses `opencode.json` (OpenCode's global config), not `flowdeck.json`. This page documents the schema understood by FlowDeck's plugin layer.

---

## Top-Level Schema

```json
{
  "agents": { ... },
  "governance": { ... },
  "model_profile": "balanced",
  "tdd_enforced": false,
  "approval_required": false,
  "volatility_threshold": 0.5,
  "default_agent": "orchestrator"
}
```

All keys are optional unless noted.

---

## `agents` — Per-Agent Model Override

> **Default:** every agent inherits the active OpenCode model.

Override the model for specific agents when you want a cheaper or more capable model for particular roles (e.g., a fast model for summarization, Opus for complex planning).

```json
{
  "agents": {
    "planner":    { "model": "anthropic/claude-opus-4" },
    "architect":  { "model": "anthropic/claude-opus-4" },
    "reviewer":  { "model": "openai/gpt-4o-mini" },
    "tester":     { "model": "anthropic/claude-sonnet-4" },
    "debugger":   { "model": "openai/gpt-4o-mini" }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | Full model spec in `provider/model` format. Examples: `anthropic/claude-opus-4`, `openai/gpt-4o-mini`, `google/gemini-2.5-pro` |

---

## `governance` — Runtime Safety Services

FlowDeck's governance layer validates multi-agent execution. Each service can be toggled independently.

```json
{
  "governance": {
    "validator": {
      "mode": "advisory"
    },
    "delegationBudget": {
      "maxToolCalls": 200,
      "maxDepth": 8,
      "maxSameStepRetries": 3
    },
    "deadlockDetection": {
      "enabled": true,
      "bounceThreshold": 3,
      "autoStop": false
    },
    "scorecard": {
      "enabled": true
    },
    "agentContractRegistry": {
      "contracts": {}
    }
  }
}
```

### `validator` — Agent Validation Mode

| Mode | Description |
|------|-------------|
| `off` | No validation performed |
| `advisory` | Logs violations; does not block execution |
| `strict` | Blocks agent actions that violate their capability contract |

In `advisory` mode, a violation produces a warning in the session log:
```
[flowdeck/validator] Agent 'coder' called forbidden tool 'deleteFile'
```

### `delegationBudget` — Per-Run Resource Limits

| Field | Type | Description |
|-------|------|-------------|
| `maxToolCalls` | number | Maximum tool calls per agent invocation |
| `maxDepth` | number | Maximum delegation chain depth (e.g., orchestrator → architect → coder is depth 2) |
| `maxSameStepRetries` | number | Maximum retries when an agent is stuck on the same step |

### `deadlockDetection` — Loop and Stall Detection

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable deadlock/loop detection |
| `bounceThreshold` | number | Number of same-task bounces before flagging as a potential loop |
| `autoStop` | boolean | If `true`, stops execution when a deadlock is detected |

Deadlock signals are written to `.codebase/DEADLOCK_SIGNALS.jsonl`.

### `scorecard` — Workflow Quality Recording

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable 10-dimension workflow quality scorecard |

Scorecards are written to `.codebase/SCORECARDS.jsonl` after each run. Dimensions include TDD adherence, design-first completion, approval rate, and budget efficiency.

### `agentContractRegistry` — Agent Capability Contracts

Defines per-agent allowed/forbidden tools, required inputs, and success criteria.

```json
{
  "governance": {
    "agentContractRegistry": {
      "contracts": {
        "coder": {
          "allowedTools": ["Read", "Edit", "Bash", "WebSearch"],
          "forbiddenTools": ["Write"],
          "requires": ["task_description"],
          "successCriteria": ["compiles", "tests_pass"]
        }
      }
    }
  }
}
```

---

## `model_profile` — Context Window Balance

Controls how FlowDeck balances token usage vs. thoroughness.

| Value | Description |
|-------|-------------|
| `balanced` | Default. Moderate context usage. Good for most workflows. |
| `fast` | Prioritizes low token usage. Use for simple, well-understood tasks. |
| `thorough` | Maximizes context usage. Use for complex multi-file refactors or unfamiliar codebases. |

---

## `tdd_enforced` — Test-Driven Development Enforcement

> **Default:** `false`

When `true`, FlowDeck agents will enforce TDD discipline: failing tests must be written before any implementation code is added. The `reviewer` agent will flag any implementation that is not preceded by a failing test.

---

## `approval_required` — Phase Approval Gates

> **Default:** `false`

When `true`, FlowDeck will pause at each phase boundary and require explicit user approval before proceeding. Useful for high-stakes changes where you want to review plan output before execution begins.

---

## `volatility_threshold` — Risk Scoring Cutoff

> **Default:** `0.5` | **Range:** `0.0` – `1.0`

Used by FlowDeck's AI safety layer to determine when a change is considered "volatile" (high risk of regression). Changes with a volatility score above this threshold are flagged or blocked depending on governance mode.

- `0.0` — everything is flagged as volatile
- `1.0` — nothing is flagged (effectively disabled)
- `0.3` — conservative; flags many changes
- `0.7` — permissive; only flags obviously risky changes

---

## `default_agent` — Default Dispatch Target

> **Default:** `orchestrator`

Sets the agent that receives commands when no explicit agent is specified. The `orchestrator` coordinates sub-agents and is the appropriate default for most workflows.

```json
{
  "default_agent": "orchestrator"
}
```

Other valid targets include `planner`, `architect`, `coder`, `reviewer`, `tester`, `debugger`, `risk-analyst`, and `policy-enforcer`.

---

## Environment Variables

FlowDeck reads the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_CONFIG_DIR` | `~/.config/opencode` | OpenCode configuration directory |
| `XDG_CONFIG_HOME` | `~/.config` | XDG Base Directory, used to derive `OPENCODE_CONFIG_DIR` |
| `FLOWDECK_CONTEXT_LIMIT` | `200000` | Context window token limit for context monitor warnings |
