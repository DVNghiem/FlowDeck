# Agents

FlowDeck runs a 12-agent system coordinated by an orchestrator. All agent configurations live in `src/agents/`. Agent definitions use YAML frontmatter (description, mode, model, temperature). The orchestrator selects specialists based on context and delegates work through the OpenCode SDK `delegate` tool.

## Agent Modes

- **primary** — visible and selectable from the user interface
- **subagent** — internal only, invoked programmatically by other agents

The orchestrator is the only primary agent. All others are subagents.

## Agent Roster

### @orchestrator (primary)

AI coding orchestrator that coordinates specialist agents. Routes all work to appropriate agents and workflows. Does not execute tasks directly.

### @planner

Creates detailed, step-by-step implementation plans. Use PROACTIVELY for any feature that spans multiple files, requires architectural decisions, or needs phased delivery.

### @architect

Designs system architecture, creates ADRs, and defines API contracts. Use PROACTIVELY when planning new modules, API changes, database schema changes, or cross-cutting concerns.

### @researcher

Researches documentation, APIs, and best practices. Searches Context7, vendor docs, and package registries. Use when implementation requires understanding an unfamiliar API or library.

### @mapper

Maps existing code. Explores unfamiliar areas read-only (structure, call paths, conventions) and documents the codebase into `~/.fd-plan/<slug>/.codebase/` files. Produces factual analysis only — no speculation.

### @backend-coder

Implements backend features and fixes based on confirmed plans. Follows existing code patterns and project conventions.

### @frontend-coder

Implements frontend features and fixes based on confirmed plans. Follows existing code patterns and project conventions.

### @devops

Implements DevOps and infrastructure changes based on confirmed plans. Follows existing repo conventions and operational safety practices.

### @tester

Writes and runs tests following TDD principles. Use when implementing new features, fixing bugs, or when test coverage is needed.

### @reviewer

Reviews code for quality, security, and adherence to project conventions, and assesses the risk of proposed changes (blast radius, regression probability, safer alternatives). Use immediately after writing or modifying code, before opening PRs.

### @security-auditor

Performs deep security audit of code changes. Checks OWASP Top 10, injection vulnerabilities, auth issues, and dependency risks. Use before merging security-sensitive code.

### @debug-specialist

Diagnoses bugs through systematic root cause analysis and fixes build failures. Reads stack traces, traces execution paths, identifies root causes; resolves compilation, type, and dependency errors directly. Use when a bug needs deep investigation or when the build is broken.
