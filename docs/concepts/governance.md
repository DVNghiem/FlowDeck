# Governance

FlowDeck's governance layer makes multi-agent execution trustworthy and auditable. It consists of six runtime services that run continuously, intercepting agent tool calls, tracking delegation, enforcing budgets, and scoring workflow quality.

Governance is transparent — every service writes its output to a machine-readable file in `.codebase/` so runs can be audited after the fact.

---

## 1. Agent Contract Registry

Every agent type has a **contract**: a declarative specification of what it is allowed to do and what it must not do.

A contract defines:

- **allowed-tools** — the list of tools the agent may call
- **forbidden-tools** — tools the agent may never call
- **required-inputs** — fields that must be present in the delegation call
- **success-criteria** — conditions that must be true after execution

Example contract for `@coder`:

```json
{
  "agent": "coder",
  "allowed-tools": ["read", "edit", "write", "bash", "run-pipeline"],
  "forbidden-tools": ["delete", "remove", "drop"],
  "required-inputs": ["prompt", "files"],
  "success-criteria": [
    "all edited files pass linter",
    "no test coverage decrease"
  ]
}
```

Contracts are defined in `src/agents/` as part of each agent's configuration. The registry is consulted by the Agent Validator before and after every agent invocation.

---

## 2. Agent Validator

The Agent Validator checks every agent call against the agent's contract. It operates in three modes:

| Mode | Behavior |
|------|----------|
| `off` | No checking — governance overhead is zero |
| `advisory` | Logs violations; execution continues |
| `strict` | Throws an error and halts execution on violation |

**Before invocation checks:**

- The agent name resolves to a known contract
- All `required-inputs` are present in the delegation call
- No forbidden tools are in the call

**After invocation checks:**

- `success-criteria` conditions are evaluated against the execution result
- Violations are logged to `.codebase/AGENT_SPANS.jsonl` under the span's metadata

Configuration in `flowdeck.json`:

```json
{
  "governance": {
    "validator": { "mode": "advisory" }
  }
}
```

---

## 3. Inter-Agent Trace Graph

Every delegation — the orchestrator invoking a specialist, or a specialist invoking a sub-agent — is recorded as a **causal span** in `.codebase/AGENT_SPANS.jsonl`.

Each span records:

```json
{
  "span_id": "s1a2b3c",
  "parent_id": "s0a1b2c",
  "agent": "coder",
  "tool": "delegate",
  "prompt": "Implement user authentication",
  "files": ["src/auth/login.ts"],
  "started_at": "2026-05-26T10:00:00Z",
  "finished_at": "2026-05-26T10:05:00Z",
  "violations": [],
  "result": "success"
}
```

Spans form a tree rooted at the orchestrator. This trace is used by:

- The Deadlock Detector to identify circular delegation
- The Workflow Scorecard to measure delegation depth
- Post-session audits to reconstruct exactly what ran

---

## 4. Delegation Budget

Every run has a **delegation budget** — per-run limits that prevent runaway agent chains. Budgets are tracked in `.codebase/BUDGETS.json`.

```json
{
  "run_id": "run-2026-05-26-001",
  "limits": {
    "maxToolCalls": 200,
    "maxDepth": 8,
    "maxSameStepRetries": 3,
    "maxSubAgentDelegations": 40
  },
  "consumed": {
    "toolCalls": 47,
    "depth": 3,
    "sameStepRetries": 1,
    "subAgentDelegations": 12
  }
}
```

When a budget limit is reached, the agent receives an error and must stop or request user approval to continue.

Configuration:

```json
{
  "governance": {
    "delegationBudget": {
      "maxToolCalls": 200,
      "maxDepth": 8,
      "maxSameStepRetries": 3
    }
  }
}
```

---

## 5. Deadlock / Loop Detector

The Deadlock Detector monitors spans and budget consumption for patterns that indicate an agent chain is stuck:

| Pattern | Detection |
|---------|-----------|
| **Bounce loop** | Same task delegated back to the same agent 3+ times |
| **Circular delegation** | Span tree contains a cycle (A → B → A) |
| **Step retry loop** | Same plan step attempted 3+ times without progress |
| **Stage stall** | No span completion for a configured time threshold |

When a pattern is detected, a signal is written to `.codebase/DEADLOCK_SIGNALS.jsonl`:

```json
{
  "signal_id": "dl-001",
  "type": "bounce_loop",
  "agent": "coder",
  "task": "Implement user authentication",
  "bounce_count": 3,
  "last_span": "s1a2b3c",
  "detected_at": "2026-05-26T10:15:00Z",
  "auto_stop": false
}
```

If `auto_stop` is `true` in the config, the orchestrator halts execution. Otherwise, it logs the signal and continues, notifying the user.

Configuration:

```json
{
  "governance": {
    "deadlockDetection": {
      "enabled": true,
      "bounceThreshold": 3,
      "autoStop": false
    }
  }
}
```

---

## 6. Workflow Scorecard

After each `/fd-verify` run, a 10-dimension quality scorecard is written to `.codebase/SCORECARDS.jsonl`.

| Dimension | Description |
|-----------|-------------|
| `tdd_discipline` | Tests written before implementation |
| `design_first` | Discuss and plan completed before execute |
| `approval_gated` | Critical steps required explicit CONFIRM |
| `budget_efficiency` | Tool calls and depth used vs. limits |
| `conflict_resolved` | Merge conflicts resolved without force |
| `rule_compliance` | Project rules and contracts respected |
| `rollback_ready` | Every task had a rollback plan |
| `context_preserved` | No context loss between phases |
| `safety_gated` | Phase gating enforced throughout |
| `governance_traced` | All agent calls have spans |

Each dimension scores 0.0–1.0. The overall score is the weighted average. Scorecards enable post-hoc comparison of runs and identification of process regressions.

---

## Complete Configuration Example

Here is a fully annotated `flowdeck.json` section covering all governance options:

```json
{
  "governance": {
    // Agent Validator — checks agent calls against contracts
    "validator": {
      "mode": "advisory"          // "off" | "advisory" | "strict"
    },

    // Delegation Budget — per-run limits
    "delegationBudget": {
      "maxToolCalls": 200,        // total tool calls allowed
      "maxDepth": 8,              // max delegation chain depth
      "maxSameStepRetries": 3,    // retries of the same plan step
      "maxSubAgentDelegations": 40 // sub-agent calls per orchestrator call
    },

    // Deadlock / Loop Detector
    "deadlockDetection": {
      "enabled": true,
      "bounceThreshold": 3,       // bounces before signal fires
      "circularThreshold": 2,      // circular spans before signal fires
      "autoStop": false           // halt execution on first signal
    },

    // Workflow Scorecard
    "scorecard": {
      "enabled": true
    }
  }
}
```

The governance layer adds measurable overhead only when set to `advisory` or `strict` mode. In `off` mode, no contract checks are performed and no spans are written (though deadlock detection still runs if enabled).
