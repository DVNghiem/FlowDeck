export interface Phase {
  number: number
  name: string
  status: "complete" | "in_progress" | "pending"
  stepsComplete: number
  stepsPending: number
  dependsOn?: string
}

export interface TelemetrySummary {
  command: string
  total_runs: number
  successes: number
  failures: number
  avg_duration_ms: number
  last_run: string
}

export interface RecentRun {
  run_id: string
  command: string
  started_at: string
  ended_at?: string
  status: string
  risk_score: number
  files_touched: number
  outcome?: string
}

export interface PendingApproval {
  id: string
  trigger: string
  reason: string
  risk_score: number
  file_path?: string
  requested_at: string
}

export interface AgentPerfSummary {
  agent: string
  model: string
  task_type: string
  success_rate: number
  runs: number
  avg_duration_ms: number
}

export interface TDDDashboardState {
  stage: string
  cycle: number
  failing_tests: number
  passing_tests: number
  behaviors_completed: number
  behaviors_pending: number
  bugs_missing_regression: number
  overrides_used: number
}

// ─── Governance Dashboard Types ──────────────────────────────────────────────

export interface AgentSpanSummary {
  span_id: string
  agent: string
  invoker: string
  stage: string
  status: string
  latency_ms?: number
  contract_violations: number
  tools_used: number
  depth: number
}

export interface TraceGraphSummary {
  trace_id: string
  root_agent: string
  started_at: string
  ended_at?: string
  total_agents: number
  max_depth: number
  failed_spans: number
  retry_total: number
  spans: AgentSpanSummary[]
}

export interface BudgetSummary {
  run_id: string
  status: string
  tool_calls_used: number
  tool_calls_limit: number
  delegations_used: number
  delegations_limit: number
  retries_used: number
  retries_limit: number
  exhaustion_reason?: string
}

export interface DeadlockSummary {
  signal_id: string
  trace_id: string
  type: string
  detected_at: string
  agents_involved: string[]
  recommended_action: string
  auto_stop: boolean
}

export interface ScorecardSummary {
  run_id: string
  command: string
  completion_status: string
  overall_score: number
  policy_violations: number
  deadlock_signals: number
  generated_at: string
}

export interface GovernanceDashboardState {
  /** Active or recent trace graphs */
  activeTraces: TraceGraphSummary[]
  /** Runs with stuck/deadlock signals */
  stuckRuns: DeadlockSummary[]
  /** Budget status for recent runs */
  budgets: BudgetSummary[]
  /** Recent validator violations */
  validatorViolations: number
  /** Scorecards for recent runs */
  scorecards: ScorecardSummary[]
  /** Average score across all commands */
  averageScore: number | null
  /** Most failure-prone commands (by scorecard) */
  worstCommands: Array<{ command: string; avg_score: number; runs: number }>
}

export interface DashboardData {
  project: string
  milestone: string
  milestone_name: string
  phases: Phase[]
  blockers: string[]
  progress: { total: number; completed: number; percent: number }
  currentPhase: number
  // Operational telemetry
  telemetrySummary: TelemetrySummary[]
  recentRuns: RecentRun[]
  pendingApprovals: PendingApproval[]
  agentPerf: AgentPerfSummary[]
  toolFailureCount: number
  // TDD state
  tdd?: TDDDashboardState
  // Governance state
  governance?: GovernanceDashboardState
}
