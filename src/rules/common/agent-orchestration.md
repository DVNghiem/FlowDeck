---
description: FlowDeck agent registry and orchestration rules — which agent to route to and when
always_on: true
stages: []
languages: []
---

# Agent Orchestration

FlowDeck provides 23 specialist agents. Each has a specific role. Using the right agent gets better results faster.

## Available FlowDeck Agents

| Agent | Purpose | When to Use |
|-------|---------|------------|
| `@architect` | System design, ADRs, API contracts | Planning new modules, API changes, schema changes |
| `@build-error-resolver` | Fix build failures and type errors | Immediately when build fails |
| `@build-resolver` | Diagnose and fix build/compile failures | When build breaks and cause is unclear |
| `@code-explorer` | Map unfamiliar codebase structure | Before modifying unfamiliar code |
| `@backend-coder` | Implement features and fixes | All code implementation |
| `@debug-specialist` | Root cause analysis for bugs | When a bug needs deep investigation |
| `@discusser` | Extract requirements via Q&A | Starting a new feature or phase |
| `@doc-updater` | Update docs after code changes | After implementation completes |
| `@plan-checker` | Review PLAN.md before execution | Before executing any plan |
| `@mapper` | Map codebase to .codebase/ docs | Running /fd-map-codebase |
| `@orchestrator` | Coordinate multi-agent execution | Managing a full feature delivery |
| `@task-splitter` | Decompose parallel workstreams | When tasks can run simultaneously |
| `@performance-optimizer` | Profile and fix performance issues | When app is slow or before release |
| `@planner` | Create detailed implementation plans | Any multi-file feature |
| `@refactor-guide` | Safe code restructuring | Reducing technical debt |
| `@researcher` | Research APIs, docs, best practices | Using an unfamiliar library or API |
| `@reviewer` | Code quality and convention review | After writing code, before PRs |
| `@security-auditor` | Deep security audit | Before merging security-sensitive code |
| `@task-splitter` | Decompose tasks into parallel tracks | Complex features with parallel work |
| `@tester` | Write and run tests (TDD) | Implementing features or fixing bugs |
| `@writer` | Draft project documentation | Writing or updating docs |

## When to Use Agents Immediately (No Prompting Needed)

These situations should trigger agent use automatically:

| Situation | Agent |
|-----------|-------|
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

FlowDeck uses adaptive workflow routing. The orchestrator selects the most appropriate workflow class at runtime based on task context, complexity, risk, and codebase familiarity.

### Workflow Classes

| Class | Stages | When Selected |
|-------|--------|---------------|
| `quick` | execute → verify | Simple, low-risk tasks (< 5 files, no ambiguity) |
| `standard` | plan → execute → verify | Normal implementation tasks |
| `explore` | discuss → plan → execute → verify | Ambiguous or unfamiliar tasks |
| `ui-heavy` | discuss → design → plan → execute → verify | UI/UX-heavy tasks |
| `bugfix` | discuss → fix-bug → verify | Bug fixes |
| `docs-only` | write-docs → verify | Documentation-only changes |
| `verify-heavy` | plan → execute → verify | High blast radius or sensitive paths |

### Routing Criteria

The orchestrator scores tasks across these dimensions:
- **Simplicity**: Is the task a simple rename, typo fix, or config update?
- **Confidence**: How well does the task description match known patterns?
- **Risk**: Is the blast radius small (< 3 files) and are no sensitive paths touched?
- **Codebase familiarity**: Is the codebase mapping fresh (< 24h)?
- **Complexity**: Is the task cheap (classify, validate, summarize) vs expensive (architect, refactor entire system)?

The workflow class with the highest score is selected. The orchestrator prefers the lightest workflow that is sufficient.

### Phase Behavior

- **quick / docs-only**: Skip discuss and plan phases. Run execute directly.
- **standard / verify-heavy**: Skip discuss. Start with plan.
- **explore / bugfix / ui-heavy**: Include discuss phase for requirements gathering.
- **ui-heavy**: Always include design phase before execute.

### Escalation

If the orchestrator discovers during execution that the initial workflow class is insufficient, it escalates to a richer workflow:
- quick → standard: when blast radius exceeds 3 files
- standard → verify-heavy: when sensitive paths are touched
- standard → ui-heavy: when design requirements emerge
- explore → standard: when confidence improves after discussion

Escalation is logged with reasons and triggers replanning.

### Phase Gating (Relaxed)

Phase gating is advisory, not absolute:
- For `quick` and `docs-only` workflows: phases may be skipped without override.
- For other workflows: follow the phase order for the selected workflow class.
- The orchestrator may override phase gating when the workflow class permits it.
