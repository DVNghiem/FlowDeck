---
name: telemetry-steward
description: Lightweight append-only telemetry layer for tracking session health, agent performance, and decision quality across FlowDeck operations.
origin: FlowDeck
---

# Telemetry Steward

FlowDeck generates a steady stream of operational signals — context compactions, agent handoffs, recorded decisions, readiness scores. Telemetry Steward captures these as structured, append-only events so operators can observe patterns, diagnose drift, and validate improvement over time.

## Purpose

Telemetry answers three questions:

1. **Context health** — Are we pruning, compacting, or checkpointing effectively? Are token savings trending up or down?
2. **Agent performance** — Which agents are fastest? Which fail most often? Where does routing latency spike?
3. **Decision quality** — Are decisions backed by evidence? Is confidence calibrated to actual risk?

It is not a control plane. It does not trigger actions. It exists purely for observability, retrospection, and baseline-setting.

## Storage

All events are written to `.codebase/TELEMETRY.jsonl`.

- One JSON object per line. No outer array.
- Append only. Never rewrite the file in place.
- Each line is self-contained and independently parseable.
- Invalid lines are skipped during read, not repaired.

## Event Schema

Every event has a top-level `type` field. All other fields are type-specific.

### `context_action`

Recorded when the context steward prunes, compacts, or checkpoints.

```json
{
  "type": "context_action",
  "action": "prune",
  "tokens_before": 12400,
  "tokens_after": 8200,
  "timestamp": "2026-06-11T09:23:17.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `action` | string | `"prune"`, `"compact"`, or `"checkpoint"` |
| `tokens_before` | integer | Context size in tokens before the action |
| `tokens_after` | integer | Context size in tokens after the action |
| `timestamp` | ISO 8601 | When the action occurred |

### `agent_routing`

Recorded when the orchestrator dispatches work to an agent.

```json
{
  "type": "agent_routing",
  "agent": "backend-coder",
  "category": "implementation",
  "task_type": "bugfix",
  "duration_ms": 14520,
  "success": true,
  "timestamp": "2026-06-11T09:45:02.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agent` | string | Agent that executed the task |
| `category` | string | High-level bucket: `"implementation"`, `"research"`, `"review"`, `"debug"`, `"docs"` |
| `task_type` | string | Specific task class: `"feature"`, `"bugfix"`, `"refactor"`, `"plan"`, `"audit"` |
| `duration_ms` | integer | Wall-clock time from dispatch to completion |
| `success` | boolean | Did the agent report success? |
| `timestamp` | ISO 8601 | When routing completed |

### `decision_recorded`

Recorded when a decision is persisted via `decision-trace`.

```json
{
  "type": "decision_recorded",
  "decision_id": "auth-refactor-2026-06-11",
  "risk_level": "medium",
  "confidence": 0.85,
  "has_evidence": true,
  "timestamp": "2026-06-11T10:12:44.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `decision_id` | string | Identifier from `decision-trace` |
| `risk_level` | string | `"low"`, `"medium"`, or `"high"` |
| `confidence` | number | 0.0 to 1.0, if available |
| `has_evidence` | boolean | Were evidence entries provided? |
| `timestamp` | ISO 8601 | When the decision was recorded |

### `readiness_check`

Recorded after a deploy-check or pre-flight verification run.

```json
{
  "type": "readiness_check",
  "status": "pass",
  "score": 0.94,
  "failing_checks": ["dependency-audit"],
  "timestamp": "2026-06-11T11:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"pass"`, `"warn"`, or `"fail"` |
| `score` | number | 0.0 to 1.0 aggregate readiness score |
| `failing_checks` | string[] | List of check names that did not pass |
| `timestamp` | ISO 8601 | When the check completed |

## Retention Policy

- **Active window**: 90 days of events remain in `.codebase/TELEMETRY.jsonl`.
- **Monthly rotation**: At the start of each month, rename the current file to `.codebase/TELEMETRY-YYYY-MM.jsonl` and start a fresh `TELEMETRY.jsonl`.
- **No automatic deletion**: Archived monthly files are never deleted without explicit operator action. If disk space is a concern, the operator moves old archives to cold storage.
- **Rationale**: Aggressive rotation destroys the long-term pattern signal. Three months of continuous data is the minimum for detecting trends like "agent routing latency creeps up on Fridays" or "context savings degrade after 20+ message sessions."

## Consumption Patterns

### Dashboard

A dashboard agent or external tool reads `.codebase/TELEMETRY.jsonl` directly and renders:

- Daily context savings (tokens_before - tokens_after)
- Agent success rate by category
- Decision confidence distribution
- Readiness score trend over the last 30 days

### Failure Replay Engine

Before recording a new failure, the failure-replay engine queries telemetry for correlated signals:

- Did `agent_routing` success rate drop before this failure?
- Were there recent `decision_recorded` entries with low confidence and no evidence?
- Did `readiness_check` scores degrade in the days leading up to the incident?

### Agent Performance Baselines

Agents query their own historical telemetry to set expectations:

- "My median `backend-coder` bugfix duration is 8 minutes. This task is taking 25 minutes — something is wrong."
- "Context actions in this repo typically save 35% of tokens. Today's savings are 12% — the compaction strategy may need tuning."

## Aggregation Recipe

**Weekly context savings**

To compute tokens reclaimed by pruning in the last 7 days:

1. Filter lines where `type == "context_action"` and `action == "prune"`.
2. For each matching line, compute `tokens_before - tokens_after`.
3. Sum the differences.

```bash
jq -c 'select(.type == "context_action" and .action == "prune") | (.tokens_before - .tokens_after)' .codebase/TELEMETRY.jsonl | awk '{s+=$1} END {print s}'
```

## Anti-Patterns

- **Do not store secrets or PII in telemetry.** Event payloads must never contain API keys, tokens, user emails, or conversation content. If you need to correlate with a sensitive ID, hash it first.
- **Do not use telemetry for real-time control.** Telemetry is observability, not a trigger. Do not write events and then read them in the same session to decide what to do next. Use state files or direct signals for control logic.
- **Do not rotate too aggressively.** Rotating or truncating `TELEMETRY.jsonl` more often than monthly makes it impossible to detect multi-week patterns like gradual agent slowdown or declining decision quality.

## Cross-References

| Component | Relationship |
|-----------|-------------|
| `context-steward` | Emits `context_action` events during prune/compact/checkpoint cycles |
| `decision-trace` | Emits `decision_recorded` events for every recorded decision |
| `failure-replay-engine` | Queries telemetry for pre-failure signal correlation |
| dashboard | Reads `TELEMETRY.jsonl` to render operational charts |

## Guidance

- Write events synchronously at the point of action. Do not buffer or batch — a single line append is cheap and eliminates flush complexity.
- If `TELEMETRY.jsonl` is missing on first write, create it. Do not fail the operation because telemetry is unavailable.
- Validate event structure before appending. A malformed line corrupts nothing (readers skip it), but it wastes space and loses signal.
- Prefer explicit `null` over omitting a field. A missing `confidence` is ambiguous (not recorded vs. not applicable); `confidence: null` is clear.
