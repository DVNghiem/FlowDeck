/**
 * FlowDeck configuration schema for `flowdeck.json`.
 *
 * Users can create this file at:
 *   - Global: ~/.config/opencode/flowdeck.json
 *   - Project: <project>/.opencode/flowdeck.json
 *
 * Project config takes precedence over global config.
 */

export interface AgentModelConfig {
  /** Model to use for this agent (e.g. "github-copilot/sonnet-4.6"). If not set, uses the currently selected model. */
  model?: string;
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
  delegationBudget?: {
    /** Max total tool calls before run is stopped. Default: 200 */
    maxToolCalls?: number;
    /** Max total delegated agents. Default: 30 */
    maxDelegatedAgents?: number;
    /** Max total retries across all steps. Default: 10 */
    maxRetries?: number;
    /** Max delegation depth. Default: 8 */
    maxDepth?: number;
    /** Max retries on the same step before escalating. Default: 3 */
    maxSameStepRetries?: number;
    /** What to do when budget is exhausted. Default: "escalate" */
    onExhaustion?: "stop" | "warn" | "escalate";
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

export interface FlowDeckConfig {
  /**
   * Per-agent model overrides. Keys are agent names (e.g. "orchestrator", "backend-coder", "frontend-coder", "devops", "planner").
   * If an agent is not listed, it uses the model the user currently has selected in OpenCode.
   */
  agents?: Record<string, AgentModelConfig>;
  designFirst?: {
    enabled?: boolean;
    enforcement?: "strict" | "advisory";
    requireApprovalBeforeImplementation?: boolean;
    modelOverrides?: Record<string, string>;
    defaultSkillsByTaskType?: Record<string, string[]>;
  };
  /** Reliability and governance layer: contracts, validation, tracing, budgets, loop detection, scoring */
  governance?: GovernanceConfig;
}
