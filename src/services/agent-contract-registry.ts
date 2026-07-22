/**
 * Agent Contract Registry
 * Defines capability contracts for every agent in the FlowDeck system.
 * Contracts are the authoritative source for what each agent is allowed to do,
 * what inputs it requires, and what outputs it must produce.
 */

export interface AgentContract {
  /** Agent identifier, matching the name in AGENT_NAMES */
  agent: string
  /** One-line description of the agent's role */
  role: string
  /** Task types this agent is allowed to handle */
  allowedTaskTypes: string[]
  /** Required inputs before the agent can execute */
  requiredInputs: string[]
  /** Fields that must appear in the agent's structured output */
  expectedOutputFields: string[]
  /** Tools the agent is permitted to use */
  allowedTools: string[]
  /** Actions the agent must never perform */
  forbiddenActions: string[]
  /** Conditions that require escalation or human intervention */
  escalationConditions: string[]
  /** Conditions that should cause the agent to stop */
  stopConditions: string[]
  /** Criteria for a successful run */
  successCriteria: string[]
}

const CONTRACTS: AgentContract[] = [
  {
    agent: "orchestrator",
    role: "Coordinate multi-agent execution, inspect context directly, and route specialist work when appropriate.",
    allowedTaskTypes: ["orchestration", "coordination", "delegation", "phase-management"],
    requiredInputs: ["STATE.md", "PLAN.md"],
    expectedOutputFields: ["completed_steps", "current_phase"],
    allowedTools: [
      "read", "read_file", "view", "glob", "grep", "search",
      "planning-state", "codebase-state",
      "repo-memory", "policy-engine",
      "codegraph", "codegraph-search", "codegraph-node", "codegraph-explore",
      "load-rules", "list-rules", "failure-replay",
      "task", // OpenCode native @agent delegation — REQUIRED
      "capture-lesson", "review-lessons",
    ],
    forbiddenActions: [
      "write_file", "edit_file", "create_file", "bash", "patch", "apply_patch",
    ],
    escalationConditions: [
      "specialist agent fails twice",
      "deadlock detected",
      "all agents blocked on the same step",
    ],
    stopConditions: [
      "all PLAN.md steps completed",
      "user requests stop",
      "budget exceeded with no fallback",
    ],
    successCriteria: [
      "all plan steps completed",
      "STATE.md phase updated to review",
      "specialist agents used for implementation, testing, and deep investigation",
    ],
  },
  {
    agent: "planner",
    role: "Create detailed implementation plans. Output PLAN.md with numbered steps.",
    allowedTaskTypes: ["planning", "task-breakdown", "step-decomposition"],
    requiredInputs: ["task description or STATE.md"],
    expectedOutputFields: ["steps", "phase"],
    allowedTools: ["read", "glob", "grep", "planning-state"],
    forbiddenActions: [
      "write source files",
      "run bash commands",
      "edit application code",
      "implement features",
    ],
    escalationConditions: [
      "requirements are ambiguous",
      "dependencies between steps unclear",
      "conflicting constraints",
    ],
    stopConditions: ["PLAN.md written and self-reviewed", "user confirms plan"],
    successCriteria: [
      "PLAN.md contains numbered steps with assigned agents",
      "each step has clear success criteria",
      "no implementation performed",
    ],
  },
  {
    agent: "backend-coder",
    role: "Implement backend features: API, services, data layer, business logic.",
    allowedTaskTypes: ["implementation", "backend", "api", "database", "service", "bugfix"],
    requiredInputs: ["PLAN.md step description", "relevant context files"],
    expectedOutputFields: ["files_modified", "summary"],
    allowedTools: ["read", "write", "edit", "bash", "glob", "grep", "capture-lesson", "review-lessons"],
    forbiddenActions: [
      "modify frontend UI component files",
      "change CI/CD config without devops involvement",
    ],
    escalationConditions: [
      "architecture decision needed",
      "security-sensitive change without audit",
      "database migration required",
    ],
    stopConditions: ["step implementation complete", "tests pass", "reviewer approves"],
    successCriteria: [
      "code written per plan step",
      "no regressions introduced",
      "tests exist or updated",
    ],
  },
  {
    agent: "frontend-coder",
    role: "Implement frontend features: UI components, client state, rendering.",
    allowedTaskTypes: ["implementation", "frontend", "ui", "component", "styling", "bugfix"],
    requiredInputs: ["PLAN.md step description", "design handoff for UI-heavy tasks"],
    expectedOutputFields: ["files_modified", "summary"],
    allowedTools: ["read", "write", "edit", "bash", "glob", "grep", "capture-lesson", "review-lessons"],
    forbiddenActions: [
      "modify backend API files",
      "change server configuration",
      "implement without approved design for UI-heavy tasks",
    ],
    escalationConditions: [
      "design handoff missing for UI-heavy task",
      "component library or design system unclear",
    ],
    stopConditions: ["step implementation complete", "tests pass", "reviewer approves"],
    successCriteria: [
      "components implemented per approved design",
      "no regressions introduced",
      "tests exist or updated",
    ],
  },
  {
    agent: "devops",
    role: "Implement DevOps and infrastructure changes: CI/CD, deployment, infra scripts.",
    allowedTaskTypes: ["implementation", "ci-cd", "deployment", "infrastructure", "operations"],
    requiredInputs: ["PLAN.md step description"],
    expectedOutputFields: ["files_modified", "summary"],
    allowedTools: ["read", "write", "edit", "bash", "glob", "grep", "capture-lesson", "review-lessons"],
    forbiddenActions: [
      "modify application source code",
      "deploy to production without approval",
    ],
    escalationConditions: [
      "production deployment requires approval",
      "destructive infra change",
    ],
    stopConditions: ["pipeline or infra change complete", "reviewer approves"],
    successCriteria: ["infrastructure code written per plan", "no prod deployment without approval"],
  },
  {
    agent: "tester",
    role: "Write and run tests following TDD principles. Tests before implementation.",
    allowedTaskTypes: ["testing", "tdd", "regression", "integration-test", "unit-test"],
    requiredInputs: ["feature or step description", "relevant source files"],
    expectedOutputFields: ["test_files_written", "tests_passing", "coverage_summary"],
    allowedTools: ["read", "write", "edit", "bash", "glob", "grep", "capture-lesson", "review-lessons"],
    forbiddenActions: [
      "delete failing tests to make suite pass",
      "implement application features",
      "skip TDD cycle (red → green → refactor)",
    ],
    escalationConditions: [
      "test infrastructure broken",
      "flaky tests blocking all progress",
    ],
    stopConditions: ["all tests pass", "coverage meets threshold"],
    successCriteria: [
      "tests written before implementation",
      "all new tests pass",
      "no test deletions to fix failures",
    ],
  },
  {
    agent: "reviewer",
    role: "Review code quality, security, and convention adherence. Read-only.",
    allowedTaskTypes: ["review", "code-review", "quality-check"],
    requiredInputs: ["files to review", "context of changes"],
    expectedOutputFields: ["verdict", "issues", "recommendations"],
    allowedTools: ["read", "glob", "grep"],
    forbiddenActions: [
      "write or edit any files",
      "make code changes",
      "approve security-sensitive changes without security audit",
    ],
    escalationConditions: [
      "security issues found",
      "critical bugs found",
      "architectural violations",
    ],
    stopConditions: ["review complete", "verdict issued"],
    successCriteria: [
      "structured review output with severity levels",
      "issues categorized",
      "no file modifications",
    ],
  },
  {
    agent: "security-auditor",
    role: "Security audit: OWASP Top 10, injection, auth vulnerabilities. Read-only.",
    allowedTaskTypes: ["security-audit", "vulnerability-scan", "auth-review"],
    requiredInputs: ["files to audit", "change context"],
    expectedOutputFields: ["findings", "severity_breakdown", "recommendations"],
    allowedTools: ["read", "glob", "grep"],
    forbiddenActions: [
      "write or edit files",
      "make changes to fix vulnerabilities directly",
    ],
    escalationConditions: [
      "CRITICAL vulnerability found",
      "auth bypass detected",
      "data exposure found",
    ],
    stopConditions: ["audit complete", "all findings documented"],
    successCriteria: [
      "OWASP checklist evaluated",
      "findings documented with severity levels",
      "no file modifications",
    ],
  },
  {
    agent: "researcher",
    role: "Research documentation, APIs, best practices. Read-only analysis.",
    allowedTaskTypes: ["research", "api-lookup", "documentation", "best-practices"],
    requiredInputs: ["research topic or question"],
    expectedOutputFields: ["findings", "references", "recommendations"],
    allowedTools: ["read", "glob", "grep", "web-search"],
    forbiddenActions: ["write or edit files", "implement solutions"],
    escalationConditions: [
      "critical information unavailable",
      "conflicting official documentation",
    ],
    stopConditions: ["research question answered", "findings documented"],
    successCriteria: [
      "findings clearly summarized",
      "sources cited",
      "no file modifications",
    ],
  },
  {
    agent: "architect",
    role: "Design system architecture, create ADRs, define API contracts.",
    allowedTaskTypes: ["architecture", "adr", "api-design", "system-design"],
    requiredInputs: ["feature or system description", "existing codebase context"],
    expectedOutputFields: ["architecture_document", "adr", "api_contracts"],
    allowedTools: ["read", "write", "glob", "grep", "planning-state", "capture-lesson", "review-lessons"],
    forbiddenActions: ["write application code", "run bash commands"],
    escalationConditions: [
      "major architectural conflict with existing system",
      "breaking API change required",
    ],
    stopConditions: ["ADR written", "architecture reviewed"],
    successCriteria: [
      "architecture documented with tradeoffs",
      "no application code written",
    ],
  },
  {
    agent: "debug-specialist",
    role: "Diagnose bugs through systematic root cause analysis (read-only) and fix build, type, and dependency failures (read/write).",
    allowedTaskTypes: [
      "debug",
      "bug-investigation",
      "root-cause-analysis",
      "build-fix",
      "type-fix",
      "dependency-fix",
      "tsc-fix",
    ],
    requiredInputs: ["bug report or build error output", "stack trace, reproduction steps, or affected files"],
    expectedOutputFields: ["root_cause", "explanation", "recommended_fix"],
    allowedTools: ["read", "write", "edit", "bash", "glob", "grep", "capture-lesson", "review-lessons"],
    forbiddenActions: [
      "fix behavioral bugs — diagnose and hand off to a coder",
      "change source files unrelated to the build failure",
      "bump dependencies to mask a build error",
      "weaken type definitions to silence tsc",
    ],
    escalationConditions: [
      "reproduction steps missing",
      "root cause outside the listed files",
      "build fails for architectural rather than mechanical reasons",
    ],
    stopConditions: [
      "root cause identified and report submitted to orchestrator",
      "build green: tsc and build both exit 0",
    ],
    successCriteria: [
      "root cause traced to a specific call site or invariant violation",
      "hypothesis is reproducible",
      "behavioral fixes handed back to orchestrator for routing to a fixer",
      "build failures resolved with the minimum change and no new type suppressions",
    ],
  },
]

const REGISTRY = new Map<string, AgentContract>(CONTRACTS.map(c => [c.agent, c]))

export function getContract(agent: string): AgentContract | null {
  return REGISTRY.get(agent) ?? null
}

export function getAllContracts(): AgentContract[] {
  return [...CONTRACTS]
}

export function listAgentsWithContracts(): string[] {
  return CONTRACTS.map(c => c.agent)
}
