# Agent Orchestration

FlowDeck provides 23 specialist agents. Each has a specific role. Using the right agent gets better results faster.

## Available FlowDeck Agents

| Agent | Purpose | When to Use |
|-------|---------|------------|
| `@architect` | System design, ADRs, API contracts | Planning new modules, API changes, schema changes |
| `@build-error-resolver` | Fix build failures and type errors | Immediately when build fails |
| `@build-resolver` | Diagnose and fix build/compile failures | When build breaks and cause is unclear |
| `@code-explorer` | Map unfamiliar codebase structure | Before modifying unfamiliar code |
| `@coder` | Implement features and fixes | All code implementation |
| `@debug-specialist` | Root cause analysis for bugs | When a bug needs deep investigation |
| `@discusser` | Extract requirements via Q&A | Starting a new feature or phase |
| `@doc-updater` | Update docs after code changes | After implementation completes |
| `@flowdeck-executor` | Execute confirmed FlowDeck plans | When a confirmed PLAN.md exists |
| `@flowdeck-plan-checker` | Review PLAN.md before execution | Before executing any plan |
| `@flowdeck-planner` | Create FlowDeck PLAN.md files | When running /plan command |
| `@mapper` | Map codebase to .codebase/ docs | Running /map-codebase |
| `@orchestrator` | Coordinate multi-agent execution | Managing a full feature delivery |
| `@parallel-coordinator` | Run parallel agent workstreams | When tasks can run simultaneously |
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
| Complex feature spanning 3+ files | `@planner` first, then `@coder` |
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
  @researcher — research the library API
  @coder     — implement the model and types
  @tester    — write test cases

Wave 2 (after Wave 1):
  @coder     — implement service using Wave 1 research
  @reviewer  — review Wave 1 implementation
```

**Pre-deploy check:**
```
Parallel:
  @reviewer          — code quality review
  @security-auditor  — security audit
  @tester            — run full test suite
```

## Phase-Gated Workflow

FlowDeck follows a structured phase order:

```
discuss → plan → execute → review
```

| Phase | Agent | Command |
|-------|-------|---------|
| discuss | `@discusser` | `/discuss` |
| plan | `@flowdeck-planner` → `@flowdeck-plan-checker` | `/plan` |
| execute | `@orchestrator` → `@coder`, `@tester`, etc. | `/new-feature` |
| review | `@reviewer` + `@security-auditor` | `/review-code` |

Do not skip phases. The orchestrator enforces phase gating automatically.
