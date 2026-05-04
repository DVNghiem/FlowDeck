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
 /fd-discuss  →  .planning/phases/phase-N/DISCUSS.md  (locked decisions)
     ↓
 /fd-plan     →  .planning/phases/phase-N/PLAN.md     (confirmed plan)
     ↓
 /fd-new-feature  →  implemented, tested, reviewed code
     ↓
 /fd-review-code  →  review report (CRITICAL/HIGH/MEDIUM/PASS)
     ↓
 /fd-deploy-check →  GO / NO-GO decision
     ↓
 /fd-checkpoint   →  .planning/STATE.md saved
```

Each step gates the next. `/fd-plan` will not proceed without a confirmed `DISCUSS.md`. `/fd-new-feature` will not execute without a confirmed `PLAN.md`.

---

## Command Reference

| Command | Purpose | Key Agents |
|---------|---------|------------|
| `/fd-new-project` | Bootstrap a new project | @orchestrator |
| `/fd-map-codebase` | Analyse and index the codebase | @mapper (×6 parallel) |
| `/fd-settings` | Configure FlowDeck settings | @orchestrator |
| `/fd-discuss` | Pre-planning discussion | @discusser |
| `/fd-plan` | Generate a phase plan | @planner, @plan-checker |
| `/fd-roadmap` | View / update project roadmap | @orchestrator |
| `/fd-dashboard` | Visual progress dashboard | — |
| `/fd-ask` | Smart agent dispatch | various |
| `/fd-new-feature` | Implement a new feature | @coder, @tester, @reviewer |
| `/fd-fix-bug` | Fix a bug with TDD | @debug-specialist, @tester, @coder |
| `/fd-review-code` | Code review | @reviewer, @researcher, @tester |
| `/fd-write-docs` | Generate documentation | @writer, @reviewer |
| `/fd-deploy-check` | Pre-deploy safety check | @tester, @security-auditor, @reviewer |
| `/fd-progress` | View project progress | — |
| `/fd-checkpoint` | Save a session checkpoint | — |
| `/fd-resume` | Resume from checkpoint | — |
| `/fd-multi-repo` | Multi-repo orchestration | @multi-repo-coordinator, @architect |

---

## Analysis Commands

These umbrella commands combine multiple analysis modules:

| Command | Purpose | Flags |
|---------|---------|-------|
| `/fd-analyze-change` | Combined impact analysis | `--impact`, `--blast-radius`, `--regression`, `--test-gap`, `--volatility` |
| `/fd-guarded-edit` | Edit gate decision | auto/confirm/review/block |
| `/fd-evaluate-risk` | Standalone risk assessment | — |
| `/fd-translate-intent` | Intent to concrete options | `assumptions`, `recommended_option` |

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
| @coder | Implements code changes |
| @tester | Writes and runs tests |
| @reviewer | Reviews code quality |
| @researcher | Investigates and provides context |
| @security-auditor | Security vulnerability scanning |
| @architect | System design and patterns |
| @writer | Documentation generation |
| @mapper | Codebase analysis |

---

← [Back to Index](index.md)