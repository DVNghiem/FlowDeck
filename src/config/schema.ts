/**
 * FlowDeck configuration schema.
 *
 * Runtime types are maintained in ./agent-models.ts so that JSONC loading
 * and model resolution live next to the shapes they operate on.
 */

import type { AgentModelConfig } from './agent-models';
export type { AgentModelConfig } from './agent-models';

export interface FlowDeckConfig {
  /** Per-agent model overrides (preferred key). */
  agentModels?: Record<string, AgentModelConfig>;
  /** Legacy per-agent model overrides (still supported). */
  agents?: Record<string, AgentModelConfig>;
  /** Maximum delegation depth for agent chains. */
  maxDelegationDepth?: number;
  /** Design-first workflow configuration. */
  designFirst?: {
    enabled?: boolean;
    enforcement?: "strict" | "advisory";
    requireApprovalBeforeImplementation?: boolean;
    modelOverrides?: Record<string, string>;
    defaultSkillsByTaskType?: Record<string, string[]>;
  };
  /** Governance layer configuration. */
  governance?: GovernanceConfig;
  /**
   * Maximum unique files an agent can write per session before being
   * forced to stop and report back to the orchestrator.
   * Default: 15. Set to 0 to disable.
   */
  maxWritesPerAgent?: number;
}

export interface GovernanceConfig {
  validator?: {
    /**
     * off: no validation
     * advisory: validate and warn but never block (default)
     * strict: block on contract violations
     */
    mode?: "off" | "advisory" | "strict";
    /** Whether to enforce contract tool allowlists. Default: true when mode != off */
    contractEnforcement?: "off" | "warn" | "strict";
  };
  deadlockDetection?: {
    /** Whether deadlock detection is active. Default: true */
    enabled?: boolean;
    /** How many agent-pair transitions trigger an agent_bounce signal. Default: 3 */
    bounceThreshold?: number;
    /** How many same-stage retries trigger a step_retry_loop signal. Default: 3 */
    retryLoopThreshold?: number;
    /** Minutes a span can remain "running" before a stage_stall signal fires. Default: 30 */
    stageStallMinutes?: number;
    /** Automatically stop the run when a signal fires. Default: false */
    autoStop?: boolean;
  };
  scorecard?: {
    /** Whether to generate scorecards after each run. Default: true */
    enabled?: boolean;
    /** Storage mode. Default: "jsonl" */
    storageMode?: "jsonl" | "none";
  };
  loopDetection?: {
    /** Whether loop detection is active. Default: true */
    enabled?: boolean;
    /** How many identical-result repeats are allowed before blocking. Default: 2 */
    maxRepeats?: number;
    /** Similarity threshold (0-1) for treating outputs as no-progress. Default: 0.9 */
    similarityThreshold?: number;
    /** Maximum number of actions to keep in memory per session. Default: 20 */
    historySize?: number;
  };
  costBudget?: {
    /**
     * Maximum estimated USD cost per workflow run.
     * When exceeded, behaviour is controlled by `onExhaustion`. Default: unlimited.
     */
    maxEstimatedCostUSD?: number;
    /** Maximum input tokens per workflow run. Default: unlimited. */
    maxInputTokens?: number;
    /** Maximum output tokens per workflow run. Default: unlimited. */
    maxOutputTokens?: number;
    /**
     * What to do when the budget is exceeded.
     * - "warn": log a warning but continue
     * - "stop": abort the current tool call with an error message
     * - "escalate": surface an escalation signal for the current run
     * Default: "warn"
     */
    onExhaustion?: "warn" | "stop" | "escalate";
  };
  delegationBudget?: {
    /** Maximum number of tool calls allowed per run. Default: 200 */
    maxToolCalls?: number;
    /** Maximum delegation depth (parent-child run nesting). Default: 3 */
    maxDepth?: number;
    /** Maximum retries for the same step before escalation. Default: 3 */
    maxSameStepRetries?: number;
  };
  supervisor?: {
    /**
     * Whether the supervisor review layer is active.
     * Default: false (opt-in)
     */
    enabled?: boolean;
    /**
     * advisory: log decision but never halt execution
     * strict: block/escalate decisions halt execution
     * Default: "advisory"
     */
    mode?: "advisory" | "strict";
    /**
     * Specific command or agent names that require supervisor review.
     * Empty array means all registered targets are gated.
     * Default: [] (all targets)
     */
    reviewedTargets?: string[];
    /**
     * Whether the supervisor is allowed to block execution.
     * Set to false to make the supervisor purely observational.
     * Default: true
     */
    canBlock?: boolean;
    /**
     * Minimum confidence score (0–1) for an "approve" decision.
     * Below this threshold the decision is "escalate".
     * Default: 0.7
     */
    confidenceThreshold?: number;
    /**
     * Whether to run a post-execution review in addition to the preflight.
     * Default: false
     */
    postExecutionReview?: boolean;
  };
}
