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
2. **Drive** the pipeline stages in order
3. **Route** work to the correct agent
4. **Supervise** progress
5. **Collect** results
6. **Return** the final coordinated outcome

The orchestrator NEVER:
- Writes or edits files directly
- Runs shell commands or builds
- Implements code itself
- Runs the full coding workflow itself

## Available FlowDeck Agents

| Agent | Purpose | When to Use |
|-------|---------|------------|
| `@orchestrator` | **Coordinate multi-agent execution** | Managing a full feature delivery — analyzes, routes, supervises |
| `@planner` | Create implementation plans, decompose into parallel waves, self-review before saving | Any multi-file feature |
| `@architect` | System design, ADRs, API contracts | Planning new modules, API changes, schema changes |
| `@researcher` | Research APIs, docs, best practices | Using an unfamiliar library or API |
| `@mapper` | Explore unfamiliar code (read-only) and document the codebase into `.codebase/` | Before modifying unfamiliar code; the init step of `/fd-task` |
| `@backend-coder` | Implement backend features and fixes | All backend code implementation |
| `@frontend-coder` | Implement UI features | All frontend code implementation |
| `@devops` | Infrastructure, CI/CD, deployment | Pipeline, container, or deploy changes |
| `@tester` | Write and run tests (TDD) | Implementing features or fixing bugs |
| `@reviewer` | Code quality review and change-risk assessment (blast radius, regression probability) | After writing code, before PRs |
| `@security-auditor` | Deep security audit | Before merging security-sensitive code |
| `@debug-specialist` | Root cause analysis for bugs; fixes build, type, and dependency failures | When a bug needs deep investigation, or immediately when the build fails |

## Agent Categories

Agents are grouped into categories for flexible routing:

| Category | Agents | Purpose |
|----------|--------|---------|
| `cognition` | `@architect`, `@planner`, `@mapper` | Deep reasoning, design, and exploration |
| `execution` | `@backend-coder`, `@frontend-coder`, `@devops` | Implementation and delivery |
| `verification` | `@tester`, `@reviewer`, `@security-auditor`, `@debug-specialist` | Quality assurance and validation |
| `governance` | `@orchestrator` | Process coordination |
| `specialist` | `@debug-specialist`, `@researcher`, `@mapper` | Domain-specific expertise |

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

- **Build failure** signal → `verification` category → default `@debug-specialist`
- **Complex feature** request → `cognition` category → default `@planner`, then hands off to `execution`
- **Security concern** → `verification` category → default `@security-auditor` (override in config if needed)

Category routing decouples workflow definitions from specific agent identities, making workflows more portable across projects.

> **Note:** Agent names are stable; categories are configurable. Prefer routing by category in workflow skills.

## The Pipeline

All tasks follow one pipeline. There are no workflow classes.

```
/fd-task → /fd-review → /fd-execute → /fd-verify → /fd-done
```

| Stage | Relevant Agents |
|-------|----------------|
| `task` | `@planner`, `@architect`, `@researcher`, `@mapper` |
| `review` | `@reviewer`, `@architect`, `@security-auditor`, `@researcher`, `@mapper` |
| `execute` | `@backend-coder`, `@frontend-coder`, `@devops`, `@tester`, `@mapper`, `@debug-specialist` |
| `verify` | `@tester`, `@reviewer`, `@security-auditor`, `@debug-specialist`, `@mapper` |
| `done` | `@reviewer`, `@devops` |

Do not skip stages and do not invent alternative paths.

**Exception — trivial tasks** (rename, typo, config value): `/fd-review` and `/fd-verify` are optional. Log the reason in `STATE.md` `skippedStages`. A task is trivial only when it touches a single file with no logic change. When in doubt, run the full pipeline.

## When to Use Agents Immediately

These situations should trigger agent use automatically. When the specific agent is unclear, route by **category** instead:

| Situation | Agent |
|-----------|-------|
| Complex feature spanning 3+ files | `@planner` first, then `@backend-coder` |
| Code was just written | `@reviewer` |
| Build fails | `@debug-specialist` |
| Bug reported | `@debug-specialist` |
| Unfamiliar code needs mapping | `@mapper` |
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

`@planner` produces the wave structure; the orchestrator executes it.

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

All file modifications and command execution MUST be routed to specialist agents.
