---
description: FlowDeck agent registry and orchestration rules — which agent to route to and when
always_on: true
stages: []
languages: []
---

# Agent Orchestration

FlowDeck provides specialist agents. The orchestrator routes work to them. The orchestrator does NOT execute work itself.

## Core Principle: Orchestrator = Router, Not Worker

The orchestrator's ONLY responsibilities:
1. **Analyze** the request
2. **Classify** the task type
3. **Choose** the appropriate workflow
4. **Route** work to the correct agent
5. **Supervise** progress
6. **Collect** results
7. **Return** the final coordinated outcome

The orchestrator NEVER:
- Writes or edits files directly
- Runs shell commands or builds
- Implements code itself
- Runs the full coding workflow itself

## Available FlowDeck Agents

| Agent | Purpose | When to Use |
|-------|---------|------------|
| `@orchestrator` | **Coordinate multi-agent execution** | Managing a full feature delivery — analyzes, classifies, routes, supervises |
| `@default-executor` | **Execute simple direct tasks** | Quick answers, simple edits, inspect-only analysis, direct stock-tool usage |
| `@architect` | System design, ADRs, API contracts | Planning new modules, API changes, schema changes |
| `@build-error-resolver` | Fix build failures and type errors | Immediately when build fails |
| `@code-explorer` | Map unfamiliar codebase structure | Before modifying unfamiliar code |
| `@backend-coder` | Implement features and fixes | All backend code implementation |
| `@debug-specialist` | Root cause analysis for bugs | When a bug needs deep investigation |
| `@discusser` | Extract requirements via Q&A | Starting a new feature or phase |
| `@doc-updater` | Update docs after code changes | After implementation completes |
| `@plan-checker` | Review PLAN.md before execution | Before executing any plan |
| `@mapper` | Map codebase to .codebase/ docs | Running /fd-map-codebase |
| `@task-splitter` | Decompose parallel workstreams | When tasks can run simultaneously |
| `@performance-optimizer` | Profile and fix performance issues | When app is slow or before release |
| `@planner` | Create detailed implementation plans | Any multi-file feature |
| `@refactor-guide` | Safe code restructuring | Reducing technical debt |
| `@researcher` | Research APIs, docs, best practices | Using an unfamiliar library or API |
| `@reviewer` | Code quality and convention review | After writing code, before PRs |
| `@security-auditor` | Deep security audit | Before merging security-sensitive code |
| `@tester` | Write and run tests (TDD) | Implementing features or fixing bugs |
| `@writer` | Draft project documentation | Writing or updating docs |

## Agent Categories

Agents are grouped into categories for flexible routing:

| Category | Agents | Purpose |
|----------|--------|---------|
| `cognition` | `@architect`, `@planner`, `@code-explorer` | Deep reasoning, design, and exploration |
| `execution` | `@backend-coder`, `@frontend-coder`, `@devops`, `@default-executor` | Implementation and delivery |
| `verification` | `@tester`, `@reviewer`, `@security-auditor`, `@build-error-resolver` | Quality assurance and validation |
| `governance` | `@orchestrator`, `@discusser`, `@plan-checker`, `@task-splitter`, `@doc-updater`, `@writer` | Process coordination and documentation |
| `specialist` | `@debug-specialist`, `@performance-optimizer`, `@refactor-guide`, `@researcher`, `@mapper` | Domain-specific expertise |

## Category-Based Routing

The orchestrator may route to a **category** instead of a named agent. Categories resolve to a default agent but can be overridden in `flowdeck.json`.

| Category | Default Agent |
|----------|--------------|
| `cognition` | `@planner` |
| `execution` | `@backend-coder` |
| `verification` | `@reviewer` |
| `governance` | `@orchestrator` |
| `specialist` | `@researcher` |

### Routing Examples

- **Build failure** signal → `verification` category → default `@build-error-resolver`
- **Complex feature** request → `cognition` category → default `@planner`, then hands off to `execution`
- **Security concern** → `verification` category → default `@security-auditor` (override in config if needed)

Category routing decouples workflow definitions from specific agent identities, making workflows more portable across projects.

> **Note:** Agent names are stable; categories are configurable. Prefer routing by category in workflow skills.

## Execution Paths

After the orchestrator analyzes and classifies a request, it selects ONE execution path:

### Direct Execution Path (via @default-executor)

For simple, low-risk tasks (< 5 files, no ambiguity):
- **Mode:** `direct-stock-tools` — use built-in tools directly for focused changes
- **Mode:** `quick-answer` — answer questions, no file modifications
- **Mode:** `inspect-only` — read and analyze, produce reports
- **Mode:** `simple-edit` — surgical changes (rename, typo fix, constant update)

The orchestrator routes to `@default-executor` with the chosen mode. The orchestrator does NOT do the work itself.

### Specialist Execution Path

For normal or complex tasks:
- Implementation → `@backend-coder`, `@frontend-coder`, `@devops`
- Testing → `@tester`
- Research → `@researcher`
- Review → `@reviewer`, `@security-auditor`
- Debug → `@debug-specialist`
- Docs → `@writer`, `@doc-updater`

### Workflow Classes

| Class | Stages | Executor | When Selected |
|-------|--------|----------|---------------|
| `quick` | execute → verify | `@default-executor` | Simple, low-risk tasks (< 5 files, no ambiguity) |
| `standard` | plan → execute → verify | Specialists | Normal implementation tasks |
| `explore` | discuss → plan → execute → verify | Specialists | Ambiguous or unfamiliar tasks |
| `ui-heavy` | discuss → design → plan → execute → verify | Specialists | UI/UX-heavy tasks |
| `bugfix` | discuss → fix-bug → verify | Specialists | Bug fixes |
| `docs-only` | write-docs → verify | `@default-executor` or `@writer` | Documentation-only changes |
| `verify-heavy` | plan → execute → verify | Specialists | High blast radius or sensitive paths |

## When to Use Agents Immediately

These situations should trigger agent use automatically. When the specific agent is unclear, route by **category** instead:

| Situation | Agent |
|-----------|-------|
| Simple task (< 5 files, no ambiguity) | `@default-executor` |
| Complex feature spanning 3+ files | `@planner` first, then `@backend-coder` |
| Code was just written | `@reviewer` |
| Build fails | `@build-error-resolver` |
| Bug reported | `@debug-specialist` |
| Security-sensitive PR | `@security-auditor` |
| Using an unfamiliar API | `@researcher` |
| Pre-production deployment | `@reviewer` + `@security-auditor` in parallel |

## Parallel Execution Patterns

Independent agents can run simultaneously. Examples:

**Feature implementation:**
```
Wave 1 (parallel):
  @researcher       — research the library API
  @backend-coder    — implement the model and types
  @tester           — write test cases

Wave 2 (after Wave 1):
  @backend-coder    — implement service using Wave 1 research
  @reviewer         — review Wave 1 implementation
```

**Pre-deploy check:**
```
Parallel:
  @reviewer          — code quality review
  @security-auditor  — security audit
  @tester            — run full test suite
```

## Adaptive Workflow Routing

The orchestrator selects the most appropriate workflow class at runtime based on task context, complexity, risk, and codebase familiarity.

### Routing Criteria

- **Simplicity**: Is the task a simple rename, typo fix, or config update?
- **Confidence**: How well does the task description match known patterns?
- **Risk**: Is the blast radius small (< 3 files) and are no sensitive paths touched?
- **Codebase familiarity**: Is the codebase mapping fresh (< 24h)?
- **Complexity**: Is the task cheap (classify, validate, summarize) vs expensive (architect, refactor entire system)?

The orchestrator prefers the lightest workflow that is sufficient. Escalate to a richer workflow only when evidence shows the current path is insufficient.

### Escalation

If the orchestrator discovers during supervision that the initial workflow class is insufficient, it escalates and re-routes:
- quick → standard: when blast radius exceeds 3 files
- standard → verify-heavy: when sensitive paths are touched
- standard → ui-heavy: when design requirements emerge
- explore → standard: when confidence improves after discussion

Escalation is logged with reasons and triggers re-routing to appropriate agents. The orchestrator STILL does not execute the work itself.

### Phase Behavior

- **quick / docs-only**: Skip discuss and plan phases. Route to `@default-executor`.
- **standard / verify-heavy**: Skip discuss. Start with plan.
- **explore / bugfix / ui-heavy**: Include discuss phase for requirements gathering.
- **ui-heavy**: Always include design phase before execute.

### Phase Gating (Relaxed)

Phase gating is advisory, not absolute:
- For `quick` and `docs-only` workflows: phases may be skipped without override.
- For other workflows: follow the phase order for the selected workflow class.
- The orchestrator may override phase gating when the workflow class permits it.

## Tool Access Enforcement

The orchestrator is restricted from using execution tools directly:

**Blocked for orchestrator:**
- File writes: `write`, `create`, `edit`, `patch`, `str_replace_editor`
- Shell execution: `bash`, `execute`, `terminal`, `shell`
- Build/test runners: `npm`, `bun`, `cargo`, `make`
- Container/deployment: `docker`, `kubectl`, `terraform`

**Allowed for orchestrator:**
- Read/search: `read`, `search`, `grep`, `glob`
- Planning: `planning-state`, `codebase-state`, `repo-memory`
- Governance: `decision-trace`, `policy-engine`, `reflect`
- Analysis: `codegraph`, `load-rules`, `council`

All file modifications and command execution MUST be routed to `@default-executor` or specialist agents.
