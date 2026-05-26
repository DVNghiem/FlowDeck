# Agents

FlowDeck runs a 27-agent system coordinated by an orchestrator. Each agent has a specific capability contract and specialized model configuration. The orchestrator selects specialists based on context and delegates work through the `delegate` tool.

## Delegation Model

The orchestrator holds the user session, decomposes requests, and dispatches to specialist agents via the `delegate` tool. Each specialist operates in its own context window and reports results back to the orchestrator. Agents are classified by mode:

- **primary**: visible and selectable from the user interface
- **subagent**: internal only, invoked programmatically by other agents
- **all**: works in both primary and subagent contexts

```
user → @orchestrator → @planner
                  → @backend-coder
                  → @frontend-coder
                  → @reviewer
                  → @security-auditor
                  → ...
```

All agent configurations are in `src/agents/`. Agent definitions use YAML frontmatter (description, mode, model, temperature, steps, permission).

---

## Orchestration

### @orchestrator

The central coordinator. Delegates to specialist agents, coordinates wave-structured task execution, and routes tool calls through the supervisor guard for pre-flight and post-execution review. The orchestrator holds the user session context and is the only agent visible as the default agent.

---

## Planning

### @architect

System design and boundary decisions. Produces architecture diagrams, evaluates technical choices, and enforces architectural constraints. Works upstream of implementation to establish clear boundaries before coding starts.

### @planner

Wave-structured task planning. Takes feature requests and produces phased implementation plans with dependency graphs, file-level scope assignments, and observable success criteria per step. The output of `@planner` feeds directly into `@backend-coder` and `@frontend-coder`.

### @discusser

Structured pre-planning Q&A. Asks clarifying questions in a systematic order to surface ambiguities before `@planner` produces a plan. Prevents the wrong plan from being built by ensuring the problem is fully understood first.

### @plan-checker

Reviews PLAN.md files for quality before execution. Checks completeness, feasibility, and testability. Returns PASS or FAIL with specific recommendations.

---

## Implementation

### @backend-coder

Implements server-side logic using TDD. Specializes in TypeScript/Node.js services, database integrations, API route handlers, and background workers. Uses `tdd-workflow` skill by default — writes failing tests first, then minimum implementation.

### @frontend-coder

Implements UI and client-side interactions using TDD. Specializes in React/Vue components, state management, API client calls, and responsive styling. Uses the same TDD discipline as `@backend-coder` but adapted for the frontend context.

### @devops

Infrastructure and deployment automation. Handles Docker, Kubernetes, CI/CD pipelines, cloud provisioning, and environment configuration. Ensures the system is deployable and monitorable before any feature is considered complete.

### @tester

Test strategy and gap detection. Analyzes modified files, identifies coverage gaps, and suggests the minimum viable test set to close them. Uses `test-gap-detector` and `test-coverage` skills to drive coverage enforcement.

### @debug-specialist

Systematic bug diagnosis and repair. Follows a structured root-cause analysis workflow: isolate the failure mode, confirm the reproduction case, identify the root cause, apply a targeted fix, then verify with a regression test.

### @build-error-resolver

Diagnoses and fixes build errors, compilation failures, and dependency issues. Use immediately when a build fails, types error out, or dependencies are broken.

---

## Review

### @reviewer

Post-commit code review. Reviews only changed code, applies the security checklist first, then quality checks. Reports findings severity-ranked with specific remediation steps and a clear pass/fail verdict.

### @security-auditor

Security vulnerability detection. Scans for OWASP Top 10 issues: SQL injection, XSS, authentication bypass, path traversal, hardcoded credentials, and insecure deserialization. Requires a separate review pass before merging any security-sensitive change.

### @risk-analyst

Failure mode analysis. Identifies what can break from a given change, estimates blast radius, and ranks risks by likelihood and impact. Produces a risk register with specific mitigations for each identified failure mode.

---

## Governance

### @policy-enforcer

Governance rule enforcement. Validates that agent actions comply with configured policies: guard rails, permission scopes, architectural constraints, and coding standards. Escalates violations with a specific policy citation.

### @supervisor

Pre-flight and post-execution review of tool calls. Intercepts and validates agent actions against configured policies before execution, and audits decisions after completion for compliance tracking.

---

## Utility

### @writer

Documentation generation. Reads code structure and produces documentation: API docs from route definitions, component docs from props, README from package manifest. Follows the project conventions in `docs/`.

### @doc-updater

Updates existing documentation to reflect code changes. Tracks which docs need updating when files are modified and keeps documentation in sync with implementation.

### @mapper

Codebase indexing. Builds and maintains a searchable index of the codebase: file purposes, dependency graph, API surface, and ownership. Used by `@planner` and `@discusser` for context before planning.

### @code-explorer

Explores unfamiliar code quickly. Analyzes file structure, traces dependencies, and produces summaries that help other agents understand a new module or codebase area without reading every line.

### @researcher

API docs and library research. Reads documentation, extracts relevant patterns, and answers questions about libraries, frameworks, and tools used in the project.

### @performance-optimizer

Identifies and fixes performance bottlenecks using data. Profiles code, detects N+1 queries, analyzes bundle size, and optimizes React render performance. Measures before and after to verify improvements.

### @refactor-guide

Guides safe refactoring of existing code without changing behavior. Provides step-by-step transformation guidance, ensures tests stay green, and helps extract functions or restructure modules.

### @auto-learner

Continuously learns from project patterns and agent decisions. Improves future recommendations by analyzing what worked well in similar past tasks.

### @design

Design-first workflow coordinator. Produces wireframes, component specs, and design token decisions. Runs before `@frontend-coder` starts implementation to ensure UI consistency and user experience quality.

### @task-splitter

Decomposes complex tasks into parallel workstreams. Analyzes dependencies, groups independent work into waves, and produces a plan for multi-agent execution.

### @architect (already listed in Planning)

System design and boundary decisions. See Planning section above.