---
description: View or update FlowDeck settings — agent models, quality profiles, and workflow toggles
argument-hint: [key=value | --list]
---

# Settings

View or update FlowDeck configuration.

**Input:** $ARGUMENTS

## Behavior

### List Settings (`--list` or no arguments)

Read `.planning/config.json` (create with defaults if missing) and display current settings:

| Setting | Value | Description |
|---------|-------|-------------|
| `model_profile` | balanced | Agent quality profile (quality/balanced/economy) |
| `tdd_enforced` | true | Require TDD red-green-refactor cycle |
| `approval_required` | false | Require human approval for risky changes |
| `volatility_threshold` | 0.7 | Risk score that triggers approval gate |
| `default_agent` | orchestrator | Default agent for commands |

### Set a Value (`key=value`)

Parse `$ARGUMENTS` as `key=value` pairs (space-separated for multiple).

Valid keys:
- `model_profile` — `quality`, `balanced`, `economy`
- `tdd_enforced` — `true`, `false`
- `approval_required` — `true`, `false`  
- `volatility_threshold` — number between 0.0 and 1.0
- `default_agent` — agent name string

Update `.planning/config.json` with the new values.

Report what was changed.

### Invalid Key

Report error with list of valid keys.

## Default Config

If `.planning/config.json` does not exist, create it with defaults:

```json
{
  "model_profile": "balanced",
  "tdd_enforced": true,
  "approval_required": false,
  "volatility_threshold": 0.7,
  "default_agent": "orchestrator"
}
```
