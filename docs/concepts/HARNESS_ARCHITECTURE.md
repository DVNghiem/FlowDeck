# FlowDeck Target Harness Architecture

**Status**: Proposed  
**Scope**: Transform FlowDeck from a prompt-heavy plugin into a real agent-harness engineering runtime while staying OpenCode-native.

## 1. Core idea

Today FlowDeck registers agents, rules, skills, commands, hooks and tools, but most critical behavior lives in prompts (orchestrator prompt, command markdown). Several runtime services exist as code and tests but are not wired into the plugin lifecycle. The target architecture moves three things into runtime enforcement:

1. **Delegation is explicit.** The orchestrator no longer "asks" the model to route; it calls a `delegate` tool that the harness executes, tracks, and budgets.
2. **Policy is executable.** Agent contracts, supervisor review, approval gates, and loop/deadlock detection run in hooks/services, not only in prompt text.
3. **State is first-class.** Workflow state, run traces, agent spans, approvals, and observations are persisted, queryable, and used for recovery, review, and audit.

The model is still the reasoner, but the harness owns execution, state, and governance.

## 2. Design principles

- **Correctness first**: use existing working services before inventing new ones.
- **OpenCode-native**: keep tools, permissions allow/deny/ask, agents, skills, hooks, and config.
- **Prompts describe, runtime enforces**: contracts, budgets, gates, and routing are checked in code.
- **Minimum surface area**: only expose what callers (agents/commands) need.
- **Testable layers**: each layer has narrow interfaces and can be exercised without the full OpenCode runtime.

## 3. High-level component diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          OpenCode host                                  │
│  (model, session, native tools, permissions, agents, commands, skills)  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FlowDeck plugin (src/index.ts)                  │
│  registers agents, tools, hooks, MCPs, commands, skills, rules          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│ ContextIngress│          │ ActionMediator│          │ExecutionSubstrate
│  Service      │          │   Service     │          │   Service     │
└───────┬───────┘          └───────┬───────┘          └───────┬───────┘
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│StatePersistence│         │Verification&  │          │Recovery&      │
│   Service     │          │   Review      │          │   Debugging   │
└───────┬───────┘          └───────┬───────┘          └───────┬───────┘
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │  Delegation & Coordination  │
                    │   (orchestrator + router)   │
                    └─────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │   Governance & Audit        │
                    │ (contracts, approvals, logs)│
                    └─────────────────────────────┘
```

## 4. End-to-end data flow

A typical user request (`"add auth middleware"`) flows through the harness:

1. **Command entry** — OpenCode fires `command.execute.before`/`after`. The harness starts a `RunTrace` (run_id).
2. **Context ingress** — `ContextIngressService` assembles `STATE.md`, `PLAN.md`, `.codebase/` docs, recent events, relevant skills/rules, and a token-budget snapshot. It short-circuits to the trivial-chat path if the request is a simple question.
3. **Routing** — `quick-router` + `workflow-router` classify the task and produce a `WorkflowRoute` (workflow class + stage sequence). `model-router` provides complexity/eligible-agent hints.
4. **Delegation** — The orchestrator calls the `delegate` tool. `ActionMediator` validates the target agent against `agent-contract-registry`, runs `agent-validator`, checks `supervisor-binding`, and enforces the delegation budget.
5. **Execution** — `ExecutionSubstrate` opens an `AgentSpan` (agent-trace-graph), tracks the child session, applies tool lifecycle hooks, and records cost/time.
6. **Tool mediation** — On every `tool.execute.before`, `ActionMediator` normalizes args, classifies risk, runs approval gates (`approval-manager`), arch constraints, phase gates, loop detection, and orchestrator guard.
7. **State persistence** — Each meaningful change writes to `.planning/STATE.md`, `.codebase/RUNS.jsonl`, `.codebase/AGENT_SPANS.jsonl`, or `.codebase/APPROVALS.json`.
8. **Verification** — At stage boundaries `VerificationService` checks tests, coverage, review verdict, and design approval before allowing the next stage.
9. **Recovery** — If a span fails or a deadlock/loop signal fires, `RecoveryService` classifies the failure, bounds retries, and either re-routes, escalates, or stops.
10. **Audit** — On run end, `WorkflowScorecard` is generated and `AGENT_PERF.json` is updated.

## 5. Key interface contracts

These interfaces are the contracts between layers. Implementations may be added incrementally.

### 5.1 Context ingress

```typescript
// src/services/context-ingress.ts
export interface AssembledContext {
  runId: string;
  sessionId: string;
  projectRoot: string;
  state: PlanningState;
  route: WorkflowRoute | null;
  relevantRules: string[];
  relevantSkills: string[];
  recentEvents: ToolEvent[];
  observations: Observation[];
  tokenBudget: TokenBudgetSnapshot;
  isTrivialChat: boolean;
}

export interface ContextIngressService {
  assemble(input: { command: string; args: string; sessionId: string }): Promise<AssembledContext>;
  refreshRunId(ctx: AssembledContext): AssembledContext;
  snapshotBudget(ctx: AssembledContext): TokenBudgetSnapshot;
}
```

### 5.2 Action mediator

```typescript
// src/services/action-mediator.ts
export interface ActionRequest {
  toolName: string;
  args: Record<string, unknown>;
  agentName?: string;
  runId: string;
  sessionId: string;
}

export interface ActionDecision {
  action: "allow" | "block" | "ask" | "escalate";
  reason: string;
  riskScore: number;
  requiredApprovalId?: string;
}

export interface ActionMediatorService {
  check(request: ActionRequest): ActionDecision;
  recordOutcome(request: ActionRequest, decision: ActionDecision, output: unknown): void;
}
```

### 5.3 Delegation

```typescript
// src/tools/delegate.ts
export interface DelegateInput {
  target: "agent" | "command";
  name: string;                 // e.g. "backend-coder" or "fd-plan"
  taskDescription: string;
  contextSummary?: string;
  mode?: "quick" | "standard" | "explore" | "verify-heavy";
  parentSpanId?: string;
}

export interface DelegateResult {
  spanId: string;
  childSessionId?: string;
  status: "running" | "blocked" | "escalated";
  reason?: string;
}
```

### 5.4 Run pipeline

```typescript
// src/tools/run-pipeline.ts
export interface RunPipelineInput {
  workflowClass: WorkflowClass;
  stages?: string[];            // optional override
  taskDescription: string;
  confirm?: boolean;
}

export interface RunPipelineResult {
  runId: string;
  completedStages: string[];
  currentStage: string | null;
  blocked: boolean;
  blockedReason?: string;
}
```

### 5.5 Delegation budget

```typescript
// src/services/delegation-budget.ts
export interface DelegationBudget {
  runId: string;
  maxToolCalls: number;
  maxDepth: number;
  maxSameStepRetries: number;
  spentToolCalls: number;
  currentDepth: number;
}

export interface DelegationBudgetService {
  init(runId: string, config?: Partial<DelegationBudget>): DelegationBudget;
  checkSpend(runId: string, toolName: string): { ok: boolean; remaining: number };
  recordDelegation(parentRunId: string, childRunId: string): boolean;
}
```

## 6. State files

| File | Owner | Purpose | Lifecycle |
|------|-------|---------|-----------|
| `.planning/STATE.md` | `planning-state` tool | Current phase, plan confirmation, design gates | Long-lived, updated per phase |
| `.planning/PLAN.md` | `planning-state` tool | Numbered plan steps | Long-lived, created per feature |
| `.codebase/RUNS.jsonl` | `run-trace` service | Command-level run history | Append-only |
| `.codebase/AGENT_SPANS.jsonl` | `agent-trace-graph` service | Causal agent delegation spans | Append-only |
| `.codebase/SCORECARDS.jsonl` | `workflow-scorecard` service | 10-dimension run quality scores | Append-only |
| `.codebase/DEADLOCK_SIGNALS.jsonl` | `deadlock-detector` service | Detected loop/deadlock signals | Append-only |
| `.codebase/APPROVALS.json` | `approval-manager` service | Pending/approved sensitive operations | Mutable |
| `.codebase/AGENT_PERF.json` | `agent-performance` service | Per-agent/model/task success stats | Mutable |
| `.codebase/WORKFLOW_ROUTING.jsonl` | `workflow-router` service | Routing decisions and escalations | Append-only |

## 7. Failure modes and recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Same tool repeated with same result | `LoopDetector` in `tool.execute.before` | Block + escalation message |
| Agent bounce / circular delegation | `deadlock-detector` over `AGENT_SPANS.jsonl` | Log signal, auto-stop if configured |
| Budget exhausted | `DelegationBudgetService` | Warn / stop / escalate based on `governance.costBudget.onExhaustion` |
| Approval missing | `approval-hook` + `ActionMediator` | Block with `APPROVAL_REQUIRED` and approval id |
| Contract violation | `agent-validator` | Advisory warning or strict block |
| Child session error | `event` hook `session.error` | Close span as `failed`, surface to parent |
| Unregistered target | `supervisor-binding` + `command-validator` | Block before execution |

## 8. Security considerations

- Secrets never enter state files; event args are sanitized by `sanitizeArgs`.
- Sensitive paths require explicit approval stored in `.codebase/APPROVALS.json` with TTL.
- Orchestrator cannot use write/edit/bash tools; `OrchestratorGuard` throws.
- Arch constraints in `.codebase/CONSTRAINTS.md` block edits to forbidden paths.
- Phase gates block implementation during discuss/plan phases.
- Tool guard blocks dangerous bash/read/write patterns when enabled.

## 9. Migration path

The harness is built incrementally. Each layer can be merged independently:

1. Wire existing unwired services into `src/index.ts` (agent validator, trace graph, run trace, scorecard, deadlock detector, delegation budget). Existing behavior remains opt-in or advisory.
2. Add `delegate` and `run-pipeline` tools behind feature flags; keep markdown commands as fallback.
3. Replace prompt-based routing directives with tool calls once delegation is stable.
4. Promote governance from advisory to strict via `flowdeck.json`.

No existing public API is broken in step 1.
