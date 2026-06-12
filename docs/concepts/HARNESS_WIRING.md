# FlowDeck Harness Wiring

This document describes how the existing unwired services are wired into `src/index.ts` and the hook system to realize the target harness.

## 1. Guiding rule

**Existing behavior stays opt-in.** The first wiring pass makes all new runtime checks advisory or feature-flagged. Strict enforcement is toggled via `flowdeck.json`.

## 2. `src/index.ts` structure after wiring

The plugin factory becomes a thin lifecycle assembler:

```typescript
const plugin: Plugin = async (input, _options) => {
  const { directory, client, worktree } = input;
  const appLog = /* existing */;

  // ── 1. Core harness services (existing + new) ────────────────────────────
  const contextIngress = createContextIngressService({ directory, client });
  const actionMediator = createActionMediatorService({ directory });
  const executionSubstrate = createExecutionSubstrateService({ directory, appLog });
  const statePersistence = createStatePersistenceService({ directory });
  const verification = createVerificationService({ directory });
  const recovery = createRecoveryService({ directory });
  const governance = createGovernanceService({ directory });
  const coordination = createCoordinationService({ directory });

  // ── 2. Existing wired services we keep ───────────────────────────────────
  const fileTracker = new SessionFileTracker();
  const { fileEdited, fileWatcherUpdated } = createFileTrackerHooks(fileTracker);
  const contextMonitor = createContextWindowMonitorHook();
  const shellEnvHook = createShellEnvHook({ directory, worktree });
  const todoHook = createTodoHook(client);
  const sessionIdleHook = createSessionIdleHook(client, fileTracker);
  const compactionHook = createCompactionHook({ directory }, fileTracker);
  const orchestratorGuard = new OrchestratorGuard();
  const autoLearnHook = createAutoLearnHook(client, fileTracker, directory, appLog);
  const notifCtrl = new NotificationController(undefined, appLog);

  // ── 3. Services previously unwired, now instantiated ─────────────────────
  const agentContracts = getAllContracts();              // agent-contract-registry
  const delegationBudget = createDelegationBudgetService();
  const quickRouter = createQuickRouter(directory);       // quick-router + workflow-router

  let loopDetector: LoopDetector | undefined;
  let eventLog: ReturnType<typeof createEventLogHooks> | undefined;
  let lastExecutedCommand: string | null = null;
  let activeRun: RunTrace | undefined;

  return {
    name: "@dv.nghiem/flowdeck",
    agent: getAgentConfigs(agentModels),
    mcp: createFlowDeckMcps(),

    config: async (cfg) => {
      // existing config logic: default_agent, agent configs, MCPs, commands, skills, rules
      // plus new wiring below
      const flowdeckConfig = loadFlowDeckConfig(directory);
      const loopCfg = flowdeckConfig.governance?.loopDetection ?? {};
      loopDetector = new LoopDetector({ ... }, appLog);

      eventLog = createEventLogHooks(appLog, (toolName, args, output, sessionId, status) => {
        loopDetector?.recordAfter(toolName, args, output, sessionId, status);
        executionSubstrate?.recordToolEvent(toolName, sessionId);
      });
    },

    tool: {
      // existing tools
      "planning-state": planningStateTool,
      "codebase-state": codebaseStateTool,
      "repo-memory": repoMemoryTool,
      "failure-replay": failureReplayTool,
      "decision-trace": decisionTraceTool,
      "policy-engine": policyEngineTool,
      "hash-edit": hashEditTool,
      "council": councilTool,
      "reflect": reflectTool,
      "codegraph": codegraphTool,
      "load-rules": loadRulesTool,
      "list-rules": listRulesTool,
      "merge-assist": mergeAssistTool,

      // NEW: harness dispatchers
      "delegate": createDelegateTool({
        directory,
        governance,
        actionMediator,
        executionSubstrate,
        coordination,
        delegationBudget,
      }),
      "run-pipeline": createRunPipelineTool({
        directory,
        contextIngress,
        coordination,
        executionSubstrate,
        statePersistence,
        verification,
        recovery,
      }),
    },

    // existing hooks
    "shell.env": shellEnvHook,
    "todo.updated": todoHook,
    "file.edited": fileEdited,
    "file.watcher.updated": fileWatcherUpdated,
    "experimental.session.compacting": compactionHook,

    "command.execute.before": async (input) => {
      lastExecutedCommand = input.command;
      activeRun = executionSubstrate.startRun(
        input.command,
        input.arguments ? JSON.parse(input.arguments) : {},
        input.sessionID,
      );
    },

    "permission.ask": async (input, output) => {
      notifyPermissionNeeded(input.title);
      // optionally: run actionMediator to pre-classify risk before the UI asks
    },

    event: async ({ event }) => {
      const type = event?.type ?? "";

      if (type === "session.created" || type === "session.started") {
        await sessionStartHook({ directory });
        if (type === "session.created") {
          await eventLog!.session({ directory }, event);
        }
      }

      if (type === "command.executed") {
        const commandName = event?.properties?.name ?? "";
        if (commandName) notifCtrl.onCommandExecuted(commandName);
      }

      await contextMonitor.event({ event });
      orchestratorGuard.onEvent(event);

      if (type === "session.idle") {
        await eventLog!.session({ directory }, event);
        const hasEdits = fileTracker.getEditedPaths().length > 0;
        if (lastExecutedCommand) lastExecutedCommand = null;
        notifCtrl.onSessionIdle(hasEdits);

        if (activeRun) {
          executionSubstrate.endRun(activeRun.run_id, "complete");
          verification.verifyStage("idle", activeRun.run_id);
          activeRun = undefined;
        }

        try {
          await sessionIdleHook();
          await autoLearnHook();
        } finally {
          fileTracker.clear();
        }
      }

      if (type === "session.error") {
        await eventLog!.session({ directory }, event);
        lastExecutedCommand = null;
        const errorMsg = /* existing extraction */;
        notifCtrl.onSessionError(errorMsg);
        if (activeRun) {
          executionSubstrate.endRun(activeRun.run_id, "failed", errorMsg);
          recovery.assessFailure(activeRun.run_id, event?.properties?.error);
          activeRun = undefined;
        }
      }
    },

    "tool.execute.before": async (toolInput, toolOutput) => {
      // existing arg normalization
      if ((toolInput.tool === "read" || toolInput.tool === "view") && toolOutput?.args) {
        // ... existing offset normalization
      }

      orchestratorGuard.check(toolInput.sessionID ?? "", toolInput.tool ?? toolInput.name ?? "");

      const runId = activeRun?.run_id ?? "no-run";
      const decision = actionMediator.check({
        toolName: toolInput.tool ?? toolInput.name ?? "unknown",
        args: toolOutput?.args ?? toolInput?.args ?? {},
        agentName: getCurrentAgent() ?? undefined,
        runId,
        sessionId: toolInput.sessionID ?? "",
      });

      if (decision.action === "block") {
        throw new Error(decision.reason);
      }
      if (decision.action === "ask" && decision.requiredApprovalId) {
        // OpenCode permission.ask is already in flight; we record the pending approval
        approvalManager.requestApproval(directory, runId, toolInput.tool, decision.reason, {
          session_id: toolInput.sessionID,
          risk_score: decision.riskScore,
        });
      }

      // legacy hooks kept for compatibility
      await approvalHook({ directory }, toolInput, toolOutput);
      await guardRailsHook({ directory }, toolInput, toolOutput);
      await toolGuardHook({ directory }, toolInput, toolOutput);
      await patchTrustHook({ directory }, toolInput, toolOutput);
      await decisionTraceHook({ directory }, toolInput, toolOutput);
      await eventLog!.before({ directory }, toolInput, toolOutput);

      const loopResult = loopDetector!.checkBefore(
        toolInput.tool ?? toolInput.name ?? "unknown",
        toolOutput?.args ?? toolInput?.args ?? {},
        toolInput.sessionID ?? "",
      );
      if (loopResult.action === "block") {
        throw new Error(loopResult.escalationMessage);
      }
      if (loopResult.action === "warn") {
        appLog(loopResult.message);
      }
    },

    "tool.execute.after": async (toolInput, toolOutput) => {
      const eventLogHealthy = await eventLog!.after({ directory }, toolInput, toolOutput);
      if (!eventLogHealthy) {
        loopDetector!.setPersistenceHealthy(false);
      }
      await contextMonitor["tool.execute.after"](toolInput, toolOutput);

      actionMediator.recordOutcome(
        {
          toolName: toolInput.tool ?? toolInput.name ?? "unknown",
          args: toolOutput?.args ?? toolInput?.args ?? {},
          agentName: getCurrentAgent() ?? undefined,
          runId: activeRun?.run_id ?? "no-run",
          sessionId: toolInput.sessionID ?? "",
        },
        { action: "allow", reason: "executed", riskScore: 0 },
        toolOutput,
      );
    },
  };
};
```

## 3. New tools

### 3.1 `delegate` tool

Located at `src/tools/delegate.ts`.

**Purpose**: Imperative agent/command dispatch from the orchestrator.

**Inputs/outputs**: see `HARNESS_ARCHITECTURE.md` §5.3.

**Behavior**:

1. Resolve target via `supervisor-binding` (`isRegisteredCommand` / `isRegisteredAgent`).
2. Load the agent contract from `agent-contract-registry`.
3. Run `agent-validator` against the requested target and task type.
4. Run `supervisor-binding.runSupervisorReview` if supervisor is enabled.
5. Check `delegation-budget` (depth, tool-call count, same-step retries).
6. Open an `AgentSpan` in `agent-trace-graph` linked to the parent span.
7. Return `DelegateResult` with `spanId` and child session info.
8. The actual child agent invocation still uses OpenCode native `@agent` routing; the tool records and governs it.

### 3.2 `run-pipeline` tool

Located at `src/tools/run-pipeline.ts`.

**Purpose**: Drive a multi-stage workflow (discuss → plan → execute → verify) without relying on the orchestrator to remember state.

**Behavior**:

1. Classify task with `quick-router` + `workflow-router`.
2. Load or create `RunState` via `state-persistence`.
3. For each pending stage:
   - Call `delegate` for the appropriate command/agent.
   - Wait for `session.idle` or `session.error`.
   - Call `verification.verifyStage`.
   - If blocked, record `blocked=true` and reason, then stop.
4. Update `.planning/STATE.md` via `planning-state` after each completed stage.
5. On completion, call `workflow-scorecard.generateScorecard`.

### 3.3 `delegation-budget` service

Located at `src/services/delegation-budget.ts`.

**Purpose**: Enforce per-run limits that README already advertises but that currently have no runtime implementation.

**Wiring**:

- Initialized when `activeRun` starts.
- Checked inside `delegate` tool.
- Checked inside `tool.execute.before` for every tool call that belongs to a run.
- Config read from `flowdeckConfig.governance.delegationBudget` (README mentions `maxToolCalls`, `maxDepth`, `maxSameStepRetries`).

## 4. Hook wiring changes

| Hook | Current | After wiring |
|------|---------|--------------|
| `command.execute.before` | Records `lastExecutedCommand` | Also starts a `RunTrace` and initializes the delegation budget |
| `command.execute.after` | Not used | Ends the run trace and triggers scorecard generation |
| `tool.execute.before` | Runs approval, guard-rails, tool-guard, patch-trust, decision-trace, event-log, loop-detector sequentially | Routes all checks through `ActionMediator`; keeps legacy hooks for compatibility |
| `tool.execute.after` | Event-log + context monitor | Also records action outcome and updates spans/cost |
| `event` (session.idle) | Notifications + auto-learn | Also ends run, runs verification, scorecard |
| `event` (session.error) | Notifications | Also ends run as failed, runs recovery assessment |
| `permission.ask` | Notification only | Optionally records pending approval in `approval-manager` |

## 5. Existing unwired services: wiring map

| Service | New wiring location | What it does at runtime |
|---------|---------------------|-------------------------|
| `agent-contract-registry` | `ActionMediator`, `GovernanceService`, `delegate` tool | Validates tool/task access per agent |
| `agent-validator` | `ActionMediator`, `GovernanceService` | Emits allow/warn/block/escalate for agent invocations |
| `agent-trace-graph` | `ExecutionSubstrate`, `delegate` tool | Records causal parent-child agent spans |
| `run-trace` | `ExecutionSubstrate`, `command.execute.before/after` | Tracks command-level runs |
| `workflow-scorecard` | `event` (session.idle) | Generates scorecard on run completion |
| `deadlock-detector` | `RecoveryService`, scheduled check on `session.idle` | Detects bounce/circular/retry/stall signals |
| `model-router` | `ContextIngressService`, `CoordinationService` | Classifies complexity and slims orchestrator prompt |
| `workflow-router` | `CoordinationService`, `run-pipeline` tool | Selects workflow class and stage sequence |
| `quick-router` | `run-pipeline` tool, orchestrator prompt | Classifies task and builds stage sequence |
| `preflight-explorer` | `ContextIngressService` | Provides repo evidence to avoid unnecessary questions |
| `cost-estimator` | `ExecutionSubstrate` | Estimates USD cost per tool/agent call |
| `approval-manager` | `ActionMediator`, `approval-hook`, `permission.ask` | Stores and checks approvals |
| `supervisor-binding` | `ActionMediator`, `GovernanceService`, `delegate` tool | Structured preflight/post-stage review |
| `command-validator` | `GovernanceService`, `command-ref-guard` hook | Blocks unregistered command references |
| `question-guard` | `ContextIngressService` | Suppresses redundant questions |
| `agent-performance` | `ExecutionSubstrate`, `RecoveryService` | Tracks success rates and recommends re-routing |

## 6. Service instantiation lifecycle

```
Plugin factory
    │
    ├── config()          → create LoopDetector, EventLog hooks, load flowdeck.json
    │
    ├── command.execute.before
    │                       → start RunTrace
    │                       → init DelegationBudget
    │
    ├── tool.execute.before
    │                       → ActionMediator.check()        (contracts, validator, supervisor, approvals, loop)
    │                       → legacy hooks (opt-in)
    │
    ├── tool.execute.after
    │                       → EventLog.after()
    │                       → ActionMediator.recordOutcome()
    │
    ├── delegate tool       → Governance review + budget check + open AgentSpan
    │
    ├── run-pipeline tool   → Coordination + StatePersistence + Verification
    │
    ├── session.idle        → end RunTrace, verify, scorecard, auto-learn
    │
    └── session.error       → end RunTrace as failed, recovery assessment
```

## 7. Configuration flags

All new runtime behavior is controlled through the existing `flowdeck.json` schema (`src/config/schema.ts`):

```json
{
  "governance": {
    "validator": { "mode": "advisory" },
    "delegationBudget": { "maxToolCalls": 200, "maxDepth": 8, "maxSameStepRetries": 3 },
    "deadlockDetection": { "enabled": true, "bounceThreshold": 3, "autoStop": false },
    "scorecard": { "enabled": true },
    "supervisor": { "enabled": false, "mode": "advisory" },
    "costBudget": { "maxEstimatedCostUSD": 5.0, "onExhaustion": "warn" }
  }
}
```

New environment flags:

| Flag | Purpose |
|------|---------|
| `FLOWDECK_DELEGATE_ENABLED=1` | Enable `delegate` tool |
| `FLOWDECK_RUN_PIPELINE_ENABLED=1` | Enable `run-pipeline` tool |
| `FLOWDECK_ACTION_MEDIATOR_STRICT=1` | Treat `ActionMediator` `block` as fatal even in advisory validator mode |

## 8. Verification checklist for the wiring PR

- [ ] `src/index.ts` compiles and existing tests pass.
- [ ] `agent-validator`, `agent-trace-graph`, `run-trace`, `workflow-scorecard`, `deadlock-detector` are imported and instantiated.
- [ ] `delegate` and `run-pipeline` tools are registered.
- [ ] `ActionMediator` is called in `tool.execute.before` and `.after`.
- [ ] `RunTrace` is started in `command.execute.before` and ended in `session.idle`/`session.error`.
- [ ] `WorkflowScorecard` is generated on run completion.
- [ ] No new hardcoded secrets or credentials.
- [ ] New services have unit tests before strict mode is enabled.

## 9. Open questions

1. Should `delegate` open the child session itself, or only record after OpenCode routes it?  
   **Recommendation**: Only record; OpenCode owns session creation. The tool returns a `spanId` immediately and the `event` hook links the child session via `parentID`.
2. Should `run-pipeline` run stages synchronously inside one tool call, or return after each stage and rely on resume?  
   **Recommendation**: Return after each stage and store `RunState`; resume via `/fd-resume` or the next `run-pipeline` call. This avoids long-running tool timeouts.
3. Where should delegation-budget state live?  
   **Recommendation**: In-memory per run, persisted into `RUNS.jsonl` fields on run end. No separate mutable file needed in the first pass.
