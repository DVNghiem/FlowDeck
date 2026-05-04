# FlowDeck Documentation

FlowDeck is an OpenCode plugin that brings structured, multi-agent workflow orchestration to your development sessions. It coordinates specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state stored in your project's `.planning/` directory.

---

## Getting Started

| Document | Description |
|----------|-------------|
| [Installation](installation.md) | Prerequisites, all three install methods, verification commands, and how to uninstall |
| [Quick Start](quick-start.md) | Step-by-step walkthrough of your first 15 minutes with FlowDeck |
| [Best Practices](best-practices.md) | Maximize efficiency and safety with Spec-Driven Development and Ensemble Reasoning |

---

## Reference

| Document | Description |
|----------|-------------|
| [Agents](agents.md) | All specialist agents — names, roles, models, and when to invoke each one |
| [Skills](skills.md) | Reusable skill patterns for common tasks |
| [Commands](commands.md) | All 18 slash commands — syntax, arguments, and what each command triggers |
| [Workflows](workflows.md) | Built-in workflows for common scenarios |
| [Rules](rules.md) | Language and common rule files — what they enforce and how to activate them |
| [Intelligence Features](intelligence.md) | AI-safety features for pre-change analysis and risk assessment |
| [Memory System](memory.md) | Persistent memory — recall past sessions, tool executions, and context across sessions |

---

## Advanced

| Document | Description |
|----------|-------------|
| [Multi-Repo](multi-repo.md) | Coordinating changes across two or more repositories in a single session |
| [Notifications](notifications.md) | Desktop and system alerts for long-running task completion |

---

## Setup & Maintenance

| Document | Description |
|----------|-------------|
| [Configuration](configuration.md) | `opencode.json` fields, project config schema, environment variables, and plugin tools |
| [Troubleshooting](troubleshooting.md) | Fixes for the most common problems: missing agents, corrupted state, build failures |

---

## Quick Command Cheat Sheet

| Command | What it does |
|---------|--------------|
| `/fd-new-project <name>` | Initialize project with planning structure and default config |
| `/fd-discuss <topic>` | Run structured requirements Q&A to capture decisions |
| `/fd-plan [--phase=N]` | Generate implementation plan from decisions (requires CONFIRM) |
| `/fd-new-feature "<description>"` | Execute full feature workflow with TDD discipline |
| `/fd-fix-bug "<description>"` | Diagnose and fix a bug with regression test |
| `/fd-deploy-check [--check=deploy,review,analysis]` | Pre-deploy checks, code review, or pre-change analysis |
| `/fd-status [--roadmap\|--workspace\|--phase=N]` | Combined status, roadmap, and workspace view |
| `/fd-checkpoint` | Save current state — safe to close the session after this |
| `/fd-resume [--yes]` | Reload STATE.md and PLAN.md to continue interrupted session |
| `/fd-reflect [--mode=reflect,learn]` | Post-session reflection or capture skill from session |
| `/fd-map-codebase [--incremental]` | Generate `.codebase/` documentation |
| `/fd-write-docs [--scope=path]` | Generate documentation from public APIs |
| `/fd-multi-repo <list\|add\|remove\|status>` | Manage multi-repo configuration |
| `/fd-translate-intent "<vague request>"` | Convert vague request into ranked implementation options |
| `/fd-ask "<question>"` | Route question to specialist agent |
| `/fd-quick "<task>"` | Quick focused task with automatic agent selection |
| `/fd-doctor` | Check FlowDeck installation and environment health |