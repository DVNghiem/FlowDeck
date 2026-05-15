# Command Architecture

FlowDeck commands are the single entry point for all operations. Each command embeds its workflow steps directly — no separate workflow files are needed.

## How Commands Work

1. You run a command (e.g., `/fd-plan`)
2. The command template is loaded with its embedded workflow steps
3. The AI follows the step-by-step process defined in the command
4. Each step may spawn agents or perform actions
5. The command may pause for user confirmation before irreversible actions

## The Core FlowDeck Cycle

```
/fd-new-project
     ↓
/fd-new-feature  →  .planning/phases/phase-N/FEATURE.md  (feature defined)
     ↓
/fd-discuss      →  .planning/phases/phase-N/DISCUSS.md  (locked decisions)
     ↓
/fd-plan         →  .planning/phases/phase-N/PLAN.md     (confirmed plan)
    ↓
/fd-design       →  design artifact + approval + handoff (UI-heavy tasks only)
    ↓
/fd-execute      →  implemented, tested, reviewed code (via TDD)
     ↓
/fd-verify       →  verification report (tests, review, security, deploy check)
     ↓
/fd-checkpoint   →  .planning/STATE.md saved
```

Each step gates the next. `/fd-discuss` requires a defined feature. `/fd-plan` requires confirmed decisions from `DISCUSS.md`. `/fd-design` is mandatory for UI-heavy tasks unless explicitly overridden. `/fd-execute` requires a confirmed `PLAN.md` and (for UI-heavy tasks) approved design handoff. `/fd-verify` confirms all checks pass before marking the feature as complete.

---

## Command Reference

| Command | Purpose | Key Agents |
|---------|---------|------------|
| `/fd-new-project` | Bootstrap a new project | @orchestrator |
| `/fd-map-codebase` | Analyse and index the codebase | @mapper (×6 parallel) |
| `/fd-new-feature` | Initialize a new feature | @orchestrator |
| `/fd-discuss` | Pre-planning discussion | @discusser |
| `/fd-plan` | Generate a phase plan | @planner, @plan-checker |
| `/fd-design` | Run design-first planning/review/system modes | @design |
| `/fd-ask` | Smart agent dispatch | various |
| `/fd-execute` | Implement feature via TDD | @orchestrator, @backend-coder/@frontend-coder/@devops, @tester, @reviewer |
| `/fd-verify` | Verify feature completion | @tester, @reviewer, @security-auditor |
| `/fd-fix-bug` | Fix a bug with TDD | @debug-specialist, @tester, @backend-coder/@frontend-coder/@devops |
| `/fd-write-docs` | Generate documentation | @writer, @reviewer |
| `/fd-deploy-check` | Pre-deploy safety check | @tester, @security-auditor, @reviewer |
| `/fd-status` | View project progress | — |
| `/fd-checkpoint` | Save a session checkpoint | — |
| `/fd-resume` | Resume from checkpoint | — |
| `/fd-multi-repo` | Multi-repo orchestration | @multi-repo-coordinator, @architect |
| `/fd-translate-intent` | Convert vague requests to ranked implementation options | @architect, @researcher |
| `/fd-suggest` | Suggest high-value feature opportunities from codebase signals | @researcher, @architect |
| `/fd-quick` | Autonomous workflow launcher — classifies task, runs correct stage sequence end-to-end | @supervisor, @orchestrator, and all workflow agents |
| `/fd-reflect` | Post-session reflection and skill capture | @auto-learner |
| `/fd-doctor` | Installation and environment diagnostics | @orchestrator |

---

## Analysis Commands

Analysis workflows are currently exposed through:

| Command | Purpose | Flags |
|---------|---------|-------|
| `/fd-translate-intent` | Intent to concrete options | `assumptions`, `recommended_option` |
| `/fd-suggest` | Suggest feature opportunities from volatility, failures, and decisions | `--category`, `--limit` |

---

## Command Structure

Each command file (`src/commands/fd-*.md`) contains:

1. **Frontmatter** — description and argument hint
2. **Purpose** — what the command does
3. **Input** — how to invoke it
4. **Process** — step-by-step workflow embedded directly
5. **Guards** — transition rules and blocking conditions
6. **Error Handling** — fail-fast rules

Example structure:
```markdown
---
description: Brief description
argument-hint: [args]
---

# Command Name

**Input:** $ARGUMENTS

## Process

### Step 1: Context Load
...

### Step 2: Execute
...

## Guards

| Transition | Guard | If Violated |
|-----------|-------|-------------|
| A → B | condition | block |
```

---

## Agent Configuration

| Agent | Purpose |
|-------|---------|
| @orchestrator | Coordinates multi-step workflows |
| @planner | Creates implementation plans |
| @backend-coder | Implements backend code changes |
| @frontend-coder | Implements frontend code changes |
| @devops | Implements infrastructure and operations changes |
| @tester | Writes and runs tests |
| @reviewer | Reviews code quality |
| @researcher | Investigates and provides context |
| @security-auditor | Security vulnerability scanning |
| @architect | System design and patterns |
| @writer | Documentation generation |
| @mapper | Codebase analysis |

---

← [Back to Index](index.md)