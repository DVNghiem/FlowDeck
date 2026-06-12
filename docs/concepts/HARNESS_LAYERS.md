# FlowDeck Harness Layers

This document maps each of the eight target harness layers to concrete responsibilities, interfaces, and existing FlowDeck code.

---

## Layer 1: Context ingress

**Responsibilities**

- Assemble prompt/context from `STATE.md`, `PLAN.md`, `.codebase/` docs, recent events, skills, and rules.
- Provide a lightweight trivial-chat path for questions that need no workflow.
- Lazy-load rules/skills based on stage and detected language.
- Deduplicate context, prune stale entries, and summarize oversized content.
- Emit token-budget diagnostics so the orchestrator knows how much context remains.

**Key types/interfaces**

```typescript
interface ContextIngressService {
  assemble(input: {
    command: string;
    args: string;
    sessionId: string;
    projectRoot: string;
  }): Promise<AssembledContext>;
}

interface AssembledContext {
  runId: string;
  sessionId: string;
  state: PlanningState;
  route: WorkflowRoute | null;
  relevantRules: string[];
  relevantSkills: string[];
  recentEvents: ToolEvent[];
  observations: Observation[];
  tokenBudget: TokenBudgetSnapshot;
  isTrivialChat: boolean;
}
```

**Reused**

- `src/services/lazy-rule-loader.ts` — language/stage-based rule discovery and selection.
- `src/tools/planning-state.ts` + `planning-state-lib.ts` — read/write `STATE.md` and `PLAN.md`.
- `src/tools/codebase-state.ts` + `repo-memory.ts` — read `.codebase/` docs and architecture graph.
- `src/services/preflight-explorer.ts` — repo evidence and task-relative context.
- `src/services/model-router.ts` — complexity classification and stage-aware agent filtering.
- `src/hooks/context-window-monitor.ts` — token-usage reminder.

**Replaced / new**

- A new `ContextIngressService` consolidates the current ad-hoc reads scattered across orchestrator prompts and command markdown.
- Trivial-chat short-circuit is currently implicit in prompts; it becomes an explicit `isTrivialChat` flag.
- Token-budget diagnostics move from a passive monitor to an active input into routing decisions.

---

## Layer 2: Action mediation

**Responsibilities**

- Expose the allowed tool surface per agent/role.
- Normalize and validate tool arguments.
- Classify risky actions and compute a risk score.
- Enforce approval gates, arch constraints, phase gates, and orchestrator guard.
- Prevent unsafe and duplicate execution through a single policy path.

**Key types/interfaces**

```typescript
interface ActionRequest {
  toolName: string;
  args: Record<string, unknown>;
  agentName?: string;
  runId: string;
  sessionId: string;
}

interface ActionDecision {
  action: "allow" | "block" | "ask" | "escalate";
  reason: string;
  riskScore: number;
  requiredApprovalId?: string;
}

interface ActionMediatorService {
  check(request: ActionRequest): ActionDecision;
  recordOutcome(request: ActionRequest, decision: ActionDecision, output: unknown): void;
}
```

**Reused**

- `src/services/agent-contract-registry.ts` — allowed/forbidden tools and escalation conditions.
- `src/services/agent-validator.ts` — contract violation detection.
- `src/services/supervisor-binding.ts` — preflight policy review for commands/agents.
- `src/services/approval-manager.ts` — approval request/check storage.
- `src/hooks/orchestrator-guard-hook.ts` — blocks orchestrator from write/edit/bash tools.
- `src/hooks/tool-guard.ts` — blocks dangerous read/write/bash patterns and arch constraints.
- `src/hooks/guard-rails.ts` — phase enforcement and design gates.
- `src/hooks/approval-hook.ts` — sensitive-file approval gate.
- `src/services/loop-detector.ts` — duplicate/no-progress execution prevention.

**Replaced / new**

- A new `ActionMediatorService` becomes the single policy path. Today each hook runs independently in `src/index.ts`; the mediator composes them in a defined order and returns one decision.
- Risk scoring is currently fragmented; the mediator centralizes it.

---

## Layer 3: Execution substrate

**Responsibilities**

- Provide the real execution environment for commands, tools, and agent delegations.
- Track command and tool lifecycle.
- Apply timeouts and budgets.
- Isolate long-running or risky operations.
- Emit observability events.

**Key types/interfaces**

```typescript
interface ExecutionSubstrate {
  startRun(command: string, args: Record<string, unknown>, sessionId: string): RunTrace;
  openSpan(input: OpenSpanInput): AgentSpan;
  closeSpan(spanId: string, status: SpanStatus, opts?: CloseSpanOptions): void;
  recordToolCall(spanId: string, toolName: string): void;
  attachTimeout(runId: string, ms: number): void;
}
```

**Reused**

- `src/services/run-trace.ts` — command-level run lifecycle.
- `src/services/agent-trace-graph.ts` — causal agent spans.
- `src/services/event-logger.ts` + `src/hooks/event-log-hook.ts` — tool/session events.
- `src/services/cost-estimator.ts` — USD cost estimation.
- `src/services/delegation-budget.ts` (new) — budget envelope.
- OpenCode native tool execution (the harness wraps it, does not replace it).

**Replaced / new**

- A new `ExecutionSubstrate` service owns the lifecycle coordination between run trace, agent spans, events, and budget. Currently these are updated separately from hooks.
- Timeout/budget isolation is mostly absent today; the substrate adds explicit timeouts and long-running-op markers.

---

## Layer 4: State persistence

**Responsibilities**

- Persist workflow/run state, action history, and observations.
- Support resumption and recovery across sessions.
- Prevent loops via remembered attempts.
- Separate ephemeral state (session cache) from long-lived state (`.planning/`, `.codebase/`).

**Key types/interfaces**

```typescript
interface StatePersistenceService {
  loadRunState(runId: string): RunState | null;
  saveRunState(runId: string, state: RunState): void;
  appendObservation(runId: string, observation: Observation): void;
  getRecentObservations(runId: string, limit?: number): Observation[];
}

interface RunState {
  runId: string;
  workflowClass: WorkflowClass;
  completedStages: string[];
  currentStage: string | null;
  blocked: boolean;
  blockedReason?: string;
  observations: Observation[];
}
```

**Reused**

- `src/tools/planning-state.ts` — `STATE.md`/`PLAN.md` persistence.
- `src/services/run-trace.ts` — `RUNS.jsonl`.
- `src/services/agent-trace-graph.ts` — `AGENT_SPANS.jsonl`.
- `src/services/event-logger.ts` — `.opencode/flowdeck-events.jsonl`.
- `src/services/loop-detector.ts` — in-memory remembered attempts.
- `src/hooks/session-persistence` skill and `src/hooks/session-idle-hook.ts` — session summaries.

**Replaced / new**

- A new `StatePersistenceService` unifies run, stage, and observation access.
- Ephemeral vs long-lived state separation is currently implicit; it becomes explicit in the interface.

---

## Layer 5: Verification and review

**Responsibilities**

- Verify that actions actually happened.
- Run checks/tests and collect evidence.
- Distinguish claimed success from verified success.
- Gate risky completion before the next stage.

**Key types/interfaces**

```typescript
interface VerificationService {
  verifyStage(stage: string, runId: string): VerificationResult;
  checkTests(runId: string): TestResult;
  checkReview(runId: string): ReviewResult;
}

interface VerificationResult {
  passed: boolean;
  evidence: string[];
  blockers: string[];
}
```

**Reused**

- `src/services/workflow-scorecard.ts` — quality dimensions (TDD, approvals, reviews).
- `src/services/agent-validator.ts` — contract compliance.
- `src/services/supervisor-binding.ts` — post-stage review when `postExecutionReview=true`.
- Existing test-running via bash hooks.

**Replaced / new**

- A new `VerificationService` moves verification from prompt instructions (`fd-verify`) to runtime checks.
- Claimed vs verified success is tracked by comparing tool output claims with later verification evidence.

---

## Layer 6: Recovery and debugging

**Responsibilities**

- Detect no-progress loops and stuck runs.
- Classify failures and bound retries.
- Explain blockages to the orchestrator/user.
- Recover from failures or escalate cleanly.
- Surface diagnostics.

**Key types/interfaces**

```typescript
interface RecoveryService {
  assessFailure(runId: string, error: unknown): FailureAssessment;
  decideRecovery(assessment: FailureAssessment): RecoveryPlan;
  executeRecovery(plan: RecoveryPlan): RecoveryResult;
}

interface FailureAssessment {
  type: "loop" | "deadlock" | "transient" | "contract" | "budget" | "unknown";
  evidence: string[];
  retryable: boolean;
}
```

**Reused**

- `src/services/loop-detector.ts` — same-result / no-progress detection.
- `src/services/deadlock-detector.ts` — agent bounce, circular delegation, stage stall.
- `src/services/failure-replay.ts` tool — historical failure lookup.
- `src/services/agent-performance.ts` — success-rate guidance for re-routing.

**Replaced / new**

- A new `RecoveryService` coordinates loop detector, deadlock detector, and failure replay into one decision path.
- Retry bounding is currently per-tool; the service bounds retries per-run and per-stage.

---

## Layer 7: Delegation and coordination

**Responsibilities**

- Orchestrator routes and supervises work.
- Select the minimal workflow class.
- Coordinate specialists and the default executor.
- Maintain parent-child visibility across sessions.
- Escalate when the initial workflow class is insufficient.

**Key types/interfaces**

```typescript
interface DelegateTool {
  execute(input: DelegateInput): Promise<DelegateResult>;
}

interface RunPipelineTool {
  execute(input: RunPipelineInput): Promise<RunPipelineResult>;
}

interface CoordinationService {
  route(task: string, ctx: AssembledContext): WorkflowRoute;
  escalate(runId: string, from: WorkflowClass, to: WorkflowClass, reason: string): void;
}
```

**Reused**

- `src/agents/orchestrator.ts` — agent definition and routing prompt.
- `src/agents/default-executor.ts` — direct execution worker.
- `src/services/quick-router.ts` — task classification and stage sequence.
- `src/services/workflow-router.ts` — adaptive workflow class selection.
- `src/services/model-router.ts` — complexity/agent-tier hints.
- `src/services/agent-trace-graph.ts` — parent/child span linkage.

**Replaced / new**

- New `delegate` and `run-pipeline` tools turn prompt-based routing into imperative calls.
- A new `CoordinationService` owns workflow class selection and escalation logic that currently lives in the orchestrator prompt.

---

## Layer 8: Governance and audit

**Responsibilities**

- Enforce permissions and approvals.
- Track sensitive actions.
- Log workflow decisions.
- Provide auditability.
- Keep destructive actions human-governed.

**Key types/interfaces**

```typescript
interface GovernanceService {
  reviewTarget(target: string, ctx: SupervisorContext): SupervisorDecision;
  recordDecision(decision: SupervisorDecision): void;
  isActionAllowed(action: string, runId: string): boolean;
}

interface AuditLogEntry {
  runId: string;
  timestamp: string;
  actor: string;
  action: string;
  decision: string;
  reason: string;
}
```

**Reused**

- `src/services/agent-contract-registry.ts` — capability contracts.
- `src/services/agent-validator.ts` — contract enforcement.
- `src/services/supervisor-binding.ts` — structured approve/revise/block/escalate decisions.
- `src/services/approval-manager.ts` — approval workflow.
- `src/services/command-validator.ts` — registered command validation.
- `src/services/workflow-scorecard.ts` — run-level audit score.
- `src/services/run-trace.ts` + `agent-trace-graph.ts` + `event-logger.ts` — decision and action logs.
- `src/tools/decision-trace.ts` — explicit decision recording.
- `src/tools/policy-engine.ts` — policy storage and query.

**Replaced / new**

- A new `GovernanceService` composes contracts, supervisor, approvals, and command validation into a single governance surface.
- Sensitive-action tracking moves from opt-in hooks to always-on audit logging.

---

## Layer-to-file quick reference

| Layer | Primary new file | Main existing files reused |
|-------|------------------|----------------------------|
| Context ingress | `src/services/context-ingress.ts` | `lazy-rule-loader`, `planning-state`, `codebase-state`, `repo-memory`, `preflight-explorer`, `model-router`, `context-window-monitor` |
| Action mediation | `src/services/action-mediator.ts` | `agent-contract-registry`, `agent-validator`, `supervisor-binding`, `approval-manager`, `orchestrator-guard-hook`, `tool-guard`, `guard-rails`, `approval-hook`, `loop-detector` |
| Execution substrate | `src/services/execution-substrate.ts` | `run-trace`, `agent-trace-graph`, `event-logger`, `event-log-hook`, `cost-estimator`, `delegation-budget` |
| State persistence | `src/services/state-persistence.ts` | `planning-state`, `run-trace`, `agent-trace-graph`, `event-logger`, `loop-detector`, `session-idle-hook` |
| Verification & review | `src/services/verification.ts` | `workflow-scorecard`, `agent-validator`, `supervisor-binding` |
| Recovery & debugging | `src/services/recovery.ts` | `loop-detector`, `deadlock-detector`, `failure-replay`, `agent-performance` |
| Delegation & coordination | `src/tools/delegate.ts`, `src/tools/run-pipeline.ts`, `src/services/coordination.ts` | `agents/orchestrator`, `agents/default-executor`, `quick-router`, `workflow-router`, `model-router`, `agent-trace-graph` |
| Governance & audit | `src/services/governance.ts` | `agent-contract-registry`, `agent-validator`, `supervisor-binding`, `approval-manager`, `command-validator`, `workflow-scorecard`, `run-trace`, `agent-trace-graph`, `event-logger`, `decision-trace`, `policy-engine` |
