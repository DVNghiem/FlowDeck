# Skills

Skills are reusable workflow patterns that encode FlowDeck's best practices into automated agents. Each skill is a self-contained unit with activation triggers, core principles, and step-by-step workflows.

## How to Activate

Skills activate in two ways:

- **Slash command**: Type `/<skill-name>` (e.g., `/fd-plan`, `/fd-code-review`)
- **Auto-trigger**: FlowDeck hooks can invoke skills automatically based on context (e.g., `code-review` triggers after every code write, `deploy-check` before any deploy)

## Skill Taxonomy

### Planning & Requirements

| Skill | Description |
|-------|-------------|
| `plan-task` | Wave-structured task breakdown for multi-file features |
| `confidence-aware-planning` | Uncertainty-aware estimates — asks clarifying questions when confidence is low |
| `intent-translator` | Converts vague requests ("make it faster") into ranked implementation options with tradeoffs |
| `decision-trace` | Records why changes were made, what evidence was used, and what assumptions were made |

Source files live in `src/skills/<name>/SKILL.md` in the project repository.

### Architecture

| Skill | Description |
|-------|-------------|
| `clean-architecture` | Layered architecture with independent use cases |
| `hexagonal-architecture` | Ports-and-adapters pattern for testable business logic |
| `layered-architecture` | Traditional UI / business logic / data layer separation |
| `ddd-architecture` | Domain-driven design with bounded contexts and aggregates |
| `saga-architecture` | Distributed transaction pattern for microservices |
| `event-driven-architecture` | Event-based decoupling between services |
| `cqrs` | Command-query responsibility segregation for read/write optimization |

### Code Quality

| Skill | Description |
|-------|-------------|
| `code-review` | Systematic review with security checklist and severity-ranked findings |
| `tdd-workflow` | Red-green-refactor discipline with 80%+ coverage enforcement |
| `test-coverage` | Coverage enforcement with pass/fail thresholds |
| `test-gap-detector` | Identifies uncovered edge cases and suggests minimum viable test sets |
| `refactor-guide` | Safe refactoring patterns — one transformation per commit, tests stay green |

Source files live in `src/skills/<name>/SKILL.md` in the project repository.

### Security

| Skill | Description |
|-------|-------------|
| `security-scan` | Scans for OWASP vulnerabilities, injection risks, and credential leakage |
| `patch-trust-score` | Scores patch reliability based on changelog, age, and publisher reputation |
| `arch-constraint-guard` | Enforces architectural constraints at commit time |
| `self-healing-policies` | Automatic rollback and recovery policies for failed deployments |

### Deployment

| Skill | Description |
|-------|-------------|
| `deploy-check` | Pre-deploy safety verification — runs tests, checks coverage, validates config |
| `git-release` | Semantic version tagging and CHANGELOG generation for releases |

### Performance

| Skill | Description |
|-------|-------------|
| `performance-profiling` | Identifies hot paths and memory bottlenecks from profiling data |
| `volatility-map` | Maps codebase areas by change frequency to predict impact zones |
| `blast-radius-preview` | Estimates blast radius of a proposed change before it is merged |
| `dependency-audit` | Scans for outdated, vulnerable, or circular dependencies |

### Frontend

| Skill | Description |
|-------|-------------|
| `frontend-pattern` | General frontend implementation patterns |
| `ui-design` | Component-level UI design patterns |
| `landing-page-design` | Landing page layout and conversion patterns |
| `dashboard-design` | Dashboard layout and data visualization patterns |
| `design-tokens` | Design tokens for consistent theming |
| `app-shell-design` | Application shell and navigation patterns |
| `wireframe-planning` | Low-fidelity wireframe to structured layout planning |
| `design-audit` | Design consistency and accessibility review |
| `ui-ux-planning` | Full UI/UX planning from user flow to component specs |
| `responsive-review` | Responsive design verification across breakpoints |
| `frontend-handoff` | Design-to-code handoff specification |

### Backend

| Skill | Description |
|-------|-------------|
| `backend-patterns` | General backend service patterns |
| `golang-patterns` | Go-specific patterns (goroutines, channels, error handling) |
| `java-patterns` | Java/JVM patterns (Spring, concurrency) |
| `python-patterns` | Python patterns (async, dataclasses, typing) |
| `rust-patterns` | Rust patterns (ownership, traits, concurrency) |
| `postgres-patterns` | PostgreSQL schema, query, and indexing patterns |
| `django-patterns` | Django-specific patterns (ORM, views, middleware) |
| `django-tdd` | Django test-driven development workflow |

### Intelligence

| Skill | Description |
|-------|-------------|
| `failure-replay-engine` | Replays past failures to understand root causes |
| `regression-prediction` | Predicts which files are likely to break from a given change |
| `repo-memory-graph` | Builds a semantic graph of codebase knowledge |
| `decision-trace` | Records decision rationale for future review |
| `volatility-map` | Maps change frequency to identify stable vs. volatile areas |

### Workflow

| Skill | Description |
|-------|-------------|
| `git-workflow` | Git branch strategy, commit conventions, and PR workflow |
| `agent-harness-construction` | How to construct and wire agents together |
| `context-load` | Strategies for loading context efficiently |
| `debug-flow` | Systematic debugging workflow |
| `documentation-writer` | Generates documentation from code structure |
| `human-review-routing` | Routes review requests to appropriate reviewers |

### More

Additional skills: `api-design`, `codebase-mapping`, `codebase-onboarding`, `code-tour`, `design-system-definition`, `multi-repo`.

## Skill File Structure

Each skill lives in `src/skills/<name>/SKILL.md` with YAML frontmatter:

```yaml
---
name: skill-name
description: One-line description of what the skill does
origin: FlowDeck
---

# Skill Title

Step-by-step workflow description...
```

## Adding New Skills

1. Create `src/skills/<name>/SKILL.md` with frontmatter
2. Add the skill path to the OpenCode plugin config in `src/index.ts`
3. Skills become available immediately — no rebuild required
