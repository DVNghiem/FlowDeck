# FlowDeck Intelligence Features

FlowDeck's intelligence layer adds safety-first AI editing, persistent architecture memory, and risk prediction directly into every OpenCode session. These features require no extra setup beyond running `/fd-new-project`.

---

## Overview

| Feature | Command / Hook | Storage |
|---------|---------------|---------|
| Change Impact Radar | Integrated analysis workflow | VOLATILITY.json, MEMORY.json |
| Patch Trust Score | Hook (automatic) | VOLATILITY.json, FAILURES.json |
| Blast Radius Preview | Integrated analysis workflow | MEMORY.json, FAILURES.json |
| Repo Memory Graph | `repo-memory` tool | `.codebase/MEMORY.json` |
| Failure Replay Engine | `failure-replay` tool | `.codebase/FAILURES.json` |
| Safe Execution Modes | Hook (automatic) | `.planning/config.json` |
| Test Gap Detector | Integrated analysis workflow | VOLATILITY.json |
| Architectural Constraint Guard | Hook (automatic) | `.codebase/CONSTRAINTS.md` |
| Intent-to-Change Translator | `/fd-translate-intent` | — |
| Confidence-Aware Planning | Skill | — |
| Codebase Volatility Map | `volatility-map` tool | `.codebase/VOLATILITY.json` |
| Human Review Routing | Integrated analysis workflow | VOLATILITY.json, FAILURES.json |
| Regression Prediction | Integrated analysis workflow | — |
| Decision Trace | `decision-trace` tool + hook | `.codebase/DECISIONS.jsonl` |
| Self-Healing Policies | `policy-engine` tool | `.codebase/POLICIES.json` |

---

## Slash Commands

### Change Impact Radar

Predicts which files, modules, APIs, tests, and database paths are likely to be affected before the AI edits anything.

Use `/fd-suggest` or `/fd-translate-intent` when you need pre-change analysis with impact context.

**Arguments:**
- `--change` — describe the proposed change (free text)
- `--scope` — `all` (default), `api`, `db`, `tests`
- `--json` — machine-readable JSON output

**Output:** Table showing researcher/architect/tester agent roles, known hotspots, and recommended traversal scope.

---

### Blast Radius Preview

Shows the likely downstream consequences of a proposed change — hidden dependencies, fragile integration points, and predicted test breakages.

Use `/fd-suggest` for broad risk discovery and `/fd-deploy-check` before release changes.

**Arguments:**
- `--change` — describe the proposed change
- `--depth` — dependency traversal hops (default: `2`)
- `--json` — JSON output

**How it works:** Reads Repo Memory Graph for dependency edges. Cross-references recurring failure patterns from Failure Replay Engine. Spawns architect + researcher + tester agent team.

---

### `/fd-translate-intent`

Converts a vague request like "make checkout faster" into concrete, ranked implementation options with tradeoffs **before** any code is written.

```
/fd-translate-intent --intent "make checkout faster"
/fd-translate-intent --intent "reduce memory usage on the worker"
```

**Arguments:**
- `--intent` — the high-level intent to translate (required)
- `--json` — JSON output

---

### Volatility Map

Displays the Codebase Volatility Map — highlights unstable zones based on churn, hotfix frequency, and unresolved TODO clusters.

Use the `volatility-map` tool directly from delegated agents for incremental updates.

**Arguments:**
- `--threshold` — minimum stability level to show: `stable`, `moderate`, `volatile` (default), `critical`
- `--limit` — max results
- `--json` — JSON output

**Populated by:** `/fd-map-codebase` writes initial data; the `volatility-map` tool allows incremental updates.

---

### Regression Prediction

Estimates the most likely regression categories for a change — performance, auth, schema, UI states, async flows, etc.

FlowDeck derives regression risk from historical failures plus volatility data during analysis-oriented workflows.

**Arguments:**
- `--change` — describe the proposed change
- `--categories` — comma-separated from: `performance`, `auth`, `schema`, `ui-state`, `async-flow`, `api-contract`, `data-integrity`, `security`, `config`, `i18n` (default: `all`)
- `--json` — JSON output

---

### Test Gap Detector

Identifies which areas of a proposed change are weakly covered by tests, and suggests the minimum high-value tests to add first.

Use `/fd-verify` and `/fd-deploy-check` for current test-gap surfacing in production workflows.

**Arguments:**
- `--change` — describe the proposed change
- `--scope` — `unit`, `integration`, `e2e`, `all` (default)
- `--json` — JSON output

---

### Human Review Routing

Routes risky patches to the right reviewer type — security, backend, infra, domain-owner, frontend, data, or devops — based on the file paths and change description.

Routing to reviewer profiles is integrated into verification and deployment checks.

**Arguments:**
- `--files` — comma-separated file paths being changed
- `--change` — describe the change
- `--json` — JSON output

**Routing rules:**
- `security` — auth, token, password, crypto, JWT, RBAC, XSS, SQL keywords; always added for high-risk patches
- `backend` — API, route, controller, migration keywords
- `infra` — Docker, Kubernetes, Terraform, CI/CD keywords
- `domain-owner` — billing, payment, checkout, subscription keywords
- `frontend` — component, CSS, React, Vue keywords
- `data` — schema, migration, index, constraint keywords
- `devops` — pipeline, YAML workflow, cron, schedule keywords

---

## Automatic Hooks

These run on every `write` or `edit` tool call with no manual trigger needed.

### Patch Trust Score

Every AI-generated write/edit is scored 0–100:

| Score | Verdict | Action |
|-------|---------|--------|
| ≥ 80 | `safe` | Auto-apply |
| 40–79 | `review-required` | Logged with signals |
| < 40 | `high-risk` | Warning printed, human review required |

**Risk signals checked:**
- File is in a `critical` volatility zone (−40 pts)
- File is in a `volatile` zone (−25 pts)
- File has moderate churn (−10 pts)
- File has prior failure history in FAILURES.json (−20 pts)
- Edit content contains high-risk keywords: password, secret, token, auth, crypto, jwt, etc. (−8 pts each, max −30 pts)

### Safe Execution Modes

Automatically selects the editing mode for the session:

| Mode | When Used |
|------|-----------|
| `auto-edit` | Trust score ≥ 60, low volatility |
| `guarded` | Trust score 30–59, or moderate volatility |
| `review-only` | Trust score < 30, or config override |

Override by setting `execution_mode` in `.planning/config.json`:
```json
{ "execution_mode": "review-only" }
```

### Architectural Constraint Guard

Before any write or edit, FlowDeck reads `.codebase/CONSTRAINTS.md` and blocks writes to any path listed under `## Forbidden Paths`.

**Example `.codebase/CONSTRAINTS.md`:**
```markdown
## Forbidden Paths
- src/legacy/
- infra/production/
- db/migrations/
```

### Decision Trace Hook

Every write or edit automatically appends a minimal entry to `.codebase/DECISIONS.jsonl` recording the tool name, file path, and timestamp. For full entries with rationale, use the `decision-trace` tool explicitly.

---

## Persistent State Tools

These tools manage the `.codebase/` directory and can be called directly by agents.

### `repo-memory`

Manages `.codebase/MEMORY.json` — a persistent graph of modules, services, APIs, schemas, and their relationships.

**Actions:** `read`, `write_node`, `query`, `delete_node`

**Example:**
```
repo-memory action=write_node node_id=auth-module node={type:module, path:src/auth, owner:alice, tags:[auth,security], ...}
repo-memory action=query query={type:module, owner:alice}
```

### `failure-replay`

Manages `.codebase/FAILURES.json` — a log of reverted commits, failed deployments, flaky tests, and bug fixes.

**Actions:** `record`, `query`, `list`, `mark_resolved`

**Example:**
```
failure-replay action=record entry={id:deploy-001, type:failed_deployment, description:"...", affected_paths:[src/auth], tags:[auth]}
failure-replay action=query query={path_prefix:src/auth}
```

### `decision-trace`

Manages `.codebase/DECISIONS.jsonl` — append-only log of why every change was made.

**Actions:** `record`, `query`, `get_for_file`

**Fields:** `file_path`, `change_type`, `rationale`, `evidence[]`, `assumptions[]`, `alternatives_considered[]`, `risk_level`

### `volatility-map`

Manages `.codebase/VOLATILITY.json` — per-file churn and stability data.

**Actions:** `read`, `write`, `query_hotspots`, `update_entry`

**Stability labels:** `stable` → `moderate` → `volatile` → `critical` (computed from churn score + hotfix count + TODO count)

### `policy-engine`

Manages `.codebase/POLICIES.json` — self-healing editing rules that update after repeated failures.

**Actions:** `list`, `add`, `record_violation`, `toggle`, `query`

---

## `.codebase/` File Reference

| File | Format | Purpose |
|------|--------|---------|
| `MEMORY.json` | JSON | Repo architecture graph (nodes + edges) |
| `FAILURES.json` | JSON | Failure history and recurrence tracking |
| `DECISIONS.jsonl` | Newline-delimited JSON | Append-only edit rationale log |
| `VOLATILITY.json` | JSON | Per-file churn and stability metrics |
| `POLICIES.json` | JSON | Self-healing editing rule set |
| `CONSTRAINTS.md` | Markdown | Forbidden path list for Arch Constraint Guard |
| `AGENT_SPANS.jsonl` | Newline-delimited JSON | Inter-agent trace graph (governance) |
| `BUDGETS.json` | JSON | Per-run delegation budget state (governance) |
| `DEADLOCK_SIGNALS.jsonl` | Newline-delimited JSON | Detected loops and deadlocks (governance) |
| `SCORECARDS.jsonl` | Newline-delimited JSON | 10-dimension workflow quality scores (governance) |

> **Tip:** All `.codebase/` files should be committed to version control so the intelligence layer improves over time.

---

## Governance Layer

The governance layer makes multi-agent execution trustworthy and debuggable. It runs automatically as internal runtime services — no commands or manual wiring needed.

### Agent Contracts

Every major agent has an explicit contract defining:

- **Allowed tools** — tools the agent may invoke
- **Forbidden actions** — things the agent must never do (e.g. `@reviewer` may not write files)
- **Required inputs** — what context must be present before the agent runs
- **Escalation conditions** — when to surface to human review
- **Success criteria** — what a good output looks like

Contracts are defined in `src/services/agent-contract-registry.ts` and cover: orchestrator, planner, plan-checker, design, backend-coder, frontend-coder, devops, tester, reviewer, security-auditor, researcher, architect, writer, and doc-updater.

### Agent Validator

Before and after each agent invocation, the validator checks the execution context against the agent's contract. Configure the enforcement mode in `flowdeck.json`:

| Mode | Behaviour |
|------|-----------|
| `off` | Validation disabled |
| `advisory` | Validate and warn; never block execution (default) |
| `strict` | Block on contract violations of severity `block` |

Violations are emitted as `contract.violation` telemetry events and attached to the agent span.

### Inter-Agent Trace Graph

Every delegation opens a **span** in the trace graph. Spans record:

- Invoker → agent direction
- Trace ID and parent span ID (causal chain)
- Tools used and outputs
- Contract violations attached to the span
- Latency and delegation depth

Spans are stored in `.codebase/AGENT_SPANS.jsonl`. The trace graph is dashboard-ready and can be rendered as a timeline, causality graph, or per-agent drilldown.

### Delegation Budget

Each workflow run has a budget tracked in `.codebase/BUDGETS.json`:

| Limit | Default | Config key |
|-------|---------|------------|
| Max tool calls | 200 | `governance.delegationBudget.maxToolCalls` |
| Max delegated agents | 30 | `governance.delegationBudget.maxDelegatedAgents` |
| Max retries (total) | 10 | `governance.delegationBudget.maxRetries` |
| Max delegation depth | 8 | `governance.delegationBudget.maxDepth` |
| Max retries per step | 3 | `governance.delegationBudget.maxSameStepRetries` |

When a limit is exceeded the system escalates to human review or (if `autoStop: true`) stops safely and summarises what was completed.

### Deadlock and Loop Detector

The detector runs four independent pattern checks after each agent invocation:

| Pattern | Trigger |
|---------|---------|
| `agent_bounce` | Same agent pair invoked ≥ N times without resolution |
| `step_retry_loop` | Same stage retried beyond the per-step limit |
| `circular_delegation` | DFS detects a cycle in the delegation graph — always triggers `auto_stop` |
| `stage_stall` | Workflow stage makes no progress within the stall window |

Signals are written to `.codebase/DEADLOCK_SIGNALS.jsonl`. Duplicate signals for the same trace and pattern are suppressed. A recovery action recommendation is attached to each signal.

### Workflow Scorecard

After every completed or failed run, a scorecard is generated and appended to `.codebase/SCORECARDS.jsonl`. Ten dimensions are scored and combined into a weighted 0–100 score:

| Dimension | Weight |
|-----------|--------|
| Stage compliance | 15% |
| TDD compliance | 15% |
| Design-first compliance | 10% |
| Approval compliance | 10% |
| Review quality | 10% |
| Handoff quality | 10% |
| Budget efficiency | 10% |
| Tool reliability | 10% |
| Policy compliance | 5% |
| Override frequency | 5% |

Scorecards support trend analysis over time. Use `getScorecardTrend(dir, command)` and `computeAverageScore(dir)` from `src/services/workflow-scorecard.ts` to query them programmatically.

---


Each intelligence feature also has a corresponding skill that gives the OpenCode agent detailed workflow instructions. Skills are installed automatically by `install.sh`.

| Skill | Name |
|-------|------|
| `change-impact-radar` | Change Impact Radar |
| `patch-trust-score` | Patch Trust Score |
| `blast-radius-preview` | Blast Radius Preview |
| `repo-memory-graph` | Repo Memory Graph |
| `failure-replay-engine` | Failure Replay Engine |
| `test-gap-detector` | Test Gap Detector |
| `arch-constraint-guard` | Architectural Constraint Guard |
| `intent-translator` | Intent-to-Change Translator |
| `confidence-aware-planning` | Confidence-Aware Planning |
| `volatility-map` | Codebase Volatility Map |
| `human-review-routing` | Human Review Routing |
| `regression-prediction` | Regression Prediction |
| `decision-trace` | Decision Trace |
| `self-healing-policies` | Self-Healing Prompt Policies |
