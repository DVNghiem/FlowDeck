# FlowDeck Integration Architecture

Second-layer integration: trust, routing, observability, and repo-intelligence.

---

## Overview

This layer adds 8 capabilities behind the existing command architecture without expanding the top-level command surface:

| Capability | Implementation | Data File |
|---|---|---|
| Patch Trust Engine | `src/hooks/patch-trust.ts` | `.codebase/DECISIONS.jsonl` |
| Agent Performance Memory | `src/services/agent-performance.ts` | `.codebase/AGENT_PERF.json` |
| Approval-Aware Execution | `src/services/approval-manager.ts` + `src/hooks/approval-hook.ts` | `.codebase/APPROVALS.json` |
| Workflow Replay + Diff | `src/services/run-trace.ts` | `.codebase/RUNS.jsonl` |
| Agent Performance Memory | `src/services/agent-performance.ts` | `.codebase/AGENT_PERF.json` |
| Structured Telemetry | `src/services/telemetry.ts` + `src/hooks/telemetry-hook.ts` | `.codebase/TELEMETRY.jsonl` |
| Dashboard Integration | `src/dashboard/` | reads all `.codebase/` files |
| Failure-to-Rule Learning | `src/services/policy-compiler.ts` (`learnFromFailure`) | `.codebase/POLICIES.json` |

---

## Services Layer (`src/services/`)

### telemetry.ts
Appends structured `TelemetryEvent` records to `.codebase/TELEMETRY.jsonl`.

```typescript
appendEvent(dir, { session_id, run_id, event, command, tool, model, duration_ms, status, risk_score })
readEvents(dir, limit)
getCommandSummary(dir)
getRunEvents(dir, run_id)
getRecentToolFailures(dir)
```

Event types: `command.start`, `command.end`, `tool.call`, `tool.complete`, `agent.dispatch`, `approval.request`, `approval.resolve`, `run.complete`, `run.fail`, `policy.violation`, `patch.scored`

### run-trace.ts
Records command execution runs with files touched, risk scores, and outcomes.

```typescript
startTrace(dir, command, args, session_id) → RunTrace
endTrace(dir, run_id, status, outcome?, error?)
touchFile(dir, run_id, filePath)
setRiskScore(dir, run_id, score)
getTrace(dir, run_id)
listTraces(dir, limit)
diffTraces(dir, run_id_a, run_id_b) → RunDiff
```

### approval-manager.ts
Manages approval state for high-risk operations.

```typescript
requestApproval(dir, run_id, trigger, reason, options) → ApprovalRequest
resolveApproval(dir, approval_id, "approved" | "rejected")
checkApproval(dir, file_path, command) → ApprovalRequest | null
getPendingApprovals(dir)
isApprovalRequired(filePath, riskScore) → boolean
isSensitivePath(filePath) → boolean
```

**Approval TTL:** 30 minutes. Sensitive path patterns: auth, payment, secrets, migrations, infra, production config.

### agent-performance.ts
Tracks success rates, costs, and durations per agent+model+task combination.

```typescript
recordRun(dir, agent, model, task_type, success, duration_ms, cost?)
getStats(dir, filter?) → AgentPerfEntry[]
getBestAgentForTask(dir, task_type) → AgentRecommendation | null
getAgentLeaderboard(dir) → AgentRecommendation[]
```

Requires ≥ 3 runs per combination before making routing recommendations. Model is tracked from the actual call — no hardcoded model list.

---

## Hooks Layer (`src/hooks/`)

### Hook execution order (tool.execute.before)
1. `telemetryHook` — record tool invocation
2. `approvalHook` — block writes on sensitive files without approval
3. `guardRailsHook` — enforce execution mode (auto/guarded/review-only)
4. `toolGuardHook` — enforce architectural constraints
5. `patchTrustHook` — score patch risk
6. `decisionTraceHook` — record edit rationale

### approval-hook.ts
Intercepts write/edit tool calls on sensitive file paths. Throws with `APPROVAL_REQUIRED:` prefix to block. Emits `approval.request` telemetry event.

Monitored tools: `write_file`, `edit_file`, `create_file`, `apply_patch`, `str_replace_editor`, `write`

### telemetry-hook.ts
Emits `tool.call` events for all tool invocations. Lightweight — never blocks.

---

## Command Integration

### /fd-new-feature
- Calls `startTrace()` on entry → `run_id` included in config
- Emits `command.start` telemetry event with risk score and phase

### /fd-fix-bug
- Calls `startTrace()` on entry → `run_id` included in config
- Emits `command.start` telemetry with prior failure count in metadata

### /fd-analyze-change
- Consumes all impact services (impact radar, blast radius, volatility, regression)
- Returns structured output with risk summary for dashboard

### /fd-dashboard
- Reads `DashboardData` including: `telemetrySummary`, `recentRuns`, `pendingApprovals`, `agentPerf`, `toolFailureCount`
- Displays operational control plane sections alongside phase progress

### /fd-guarded-edit
- Run approval gate before risky operations
- Uses `isApprovalRequired()` + `requestApproval()` pattern

---

## Dashboard Sections

The dashboard at `http://localhost:<port>` now includes:

1. **Milestone Progress** — phase timeline (existing)
2. **Blockers** — from STATE.md (existing)
3. **⚠ Pending Approvals** — approval requests waiting on user
4. **Recent Runs** — last 10 command runs with status, risk, files touched
5. **Command Telemetry** — aggregate stats per command (total runs, success rate, avg duration)
6. **Agent Performance** — success rate per agent/model/task combination

---

## Data Schema

### TELEMETRY.jsonl (append-only)
```json
{"id":"uuid","ts":"ISO","session_id":"s","run_id":"r","event":"command.end","command":"fd-fix-bug","status":"ok","duration_ms":1200,"risk_score":72}
```

### RUNS.jsonl (append-only, rewritten on end/update)
```json
{"run_id":"uuid","session_id":"s","command":"fd-new-feature","args":{},"started_at":"ISO","ended_at":"ISO","status":"complete","files_touched":["src/auth.ts"],"event_ids":[],"risk_score":65,"outcome":"Feature merged"}
```

### APPROVALS.json
```json
{"requests":[{"id":"uuid","run_id":"r","session_id":"s","requested_at":"ISO","status":"pending","trigger":"sensitive_file","reason":"Auth change","risk_score":25,"file_path":"src/auth.ts"}]}
```

### AGENT_PERF.json
```json
{"entries":[{"agent":"backend-coder","model":"<user-configured>","task_type":"implementation","runs":12,"successes":11,"failures":1,"total_duration_ms":60000,"total_cost":0.48,"last_run":"ISO","last_status":"success"}],"updated_at":"ISO"}
```

---

## Config Additions

No new required config. Optional per-repo overrides:

- `.codebase/POLICIES.json` — runtime policy rules (existing, enhanced)
- `.codebase/CONSTRAINTS.md` — architectural constraints (existing)

---

## Agents

Three new specialist agents available for programmatic invocation:

| Agent | File | Purpose |
|---|---|---|
| `replay-analyst` | `agents/replay-analyst.md` | Diff run traces, surface regressions |
| `eval-reviewer` | `agents/eval-reviewer.md` | Evaluate agent/model routing quality |
| `cost-optimizer` | `agents/cost-optimizer.md` | Recommend cheaper routing with no quality loss |

---

## Policy Compiler Service (`src/services/policy-compiler.ts`)

Compiles active policies from `POLICIES.json` into runtime evaluators.

```typescript
evaluatePolicies(dir, ctx) → PolicyViolation[]
learnFromFailure(failure_type, affected_paths, root_cause?) → ProposedPolicy | null
formatViolations(violations) → string
```

**PolicyContext fields:** `command`, `file_path`, `change_description`, `tool`, `risk_score`

**Severity derivation:** Rules containing "require approval", "never", "must not" → `block`; otherwise → `warn`

**Pattern learning:** Proposes policies for recognized failure types (`auth_bypass`, `payment_failure`, `migration_failure`, `infra_change`, `secrets_exposure`). Returns `null` for unrecognized patterns.

---

## `/fd-approve` Command (`src/commands/governance/approve.ts`)

Governance command for managing approval gates raised by the approval hook.

```
/fd-approve                           # list all pending approvals
/fd-approve --id <uuid>               # approve → operation may proceed
/fd-approve --id <uuid> --reject      # reject → operation stays blocked
/fd-approve --recent                  # last 10 resolved approvals
/fd-approve --json                    # machine-readable output
```

Resolving an approval emits an `approval.resolve` telemetry event and records the decision in `APPROVALS.json`.

---

## Migration Notes

All existing commands continue to work unchanged. New capabilities are additive:

- `fd-new-feature` — now uses model router instead of hardcoded models; emits telemetry
- `fd-fix-bug` — emits run trace on entry, evaluates policies, proposes new policies from failures
- `fd-verify` — shows policy violations in output table
- Dashboard — new operational sections appear only when data exists (no empty-state noise)
- Approval hook — only triggers for write operations on sensitive file patterns; safe paths are unaffected
- Telemetry — append-only, never read during hook execution, cannot slow down tool calls

First-run behavior: all new `.codebase/` data files are created on first use. No migration needed.
