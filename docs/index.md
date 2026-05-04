# FlowDeck Documentation

FlowDeck is an OpenCode plugin that brings structured, multi-agent workflow orchestration to your development sessions. It coordinates 29 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state stored in your project's `.planning/` directory.

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
| [Agents](agents.md) | All 29 agents — names, roles, models, and when to invoke each one |
| [Skills](skills.md) | All 24 skills — what each skill does and example prompts that activate it |
| [Commands](commands.md) | All 27 slash commands — syntax, arguments, and what each command triggers |
| [Workflows](workflows.md) | All 15 built-in workflows — flow diagrams, inputs, outputs, and agent involvement |
| [Rules](rules.md) | Language and common rule files — what they enforce and how to activate them |
| [Intelligence Features](intelligence.md) | 15 AI-safety features: impact radar, patch trust, blast radius, decision trace, and more |

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
| `/fd-new-project <name>` | Initialize `.planning/` directory structure for a new project |
| `/fd-discuss <phase>` | Run structured requirements Q&A with `@discusser` |
| `/fd-plan <phase>` | Generate a wave-structured `PLAN.md` (requires `CONFIRMED` to execute) |
| `/fd-new-feature "<description>"` | Execute full feature workflow via `@orchestrator` |
| `/fd-review-code [staged\|branch]` | Parallel review by `@reviewer`, `@security-auditor`, `@tester` |
| `/fd-fix-bug "<description>"` | Diagnose and fix a bug with regression test |
| `/fd-checkpoint` | Save current state — safe to close the session after this |
| `/fd-resume` | Reload `STATE.md` and `PLAN.md` context in a new session |
| `/fd-progress` | Print current state, active plan, and recent results |
| `/fd-map-codebase` | Generate `.codebase/` documentation from source analysis |
| `/fd-roadmap` | View or update phase statuses and milestones |
| `/fd-dashboard` | Open the project dashboard with phase progress and blockers |
| `/fd-deploy-check` | Run pre-deployment checks and produce a go/no-go verdict |
| `/fd-write-docs` | Generate or update project documentation |
| `/fd-multi-repo` | Coordinate a change across multiple registered repositories |
| `/fd-settings` | View or update FlowDeck model assignments and configuration |
| `/fd-impact-radar` | Predict affected files/APIs/tests before editing |
| `/fd-blast-radius` | Show downstream consequences and hidden dependencies of a change |
| `/fd-translate-intent` | Convert vague request into ranked concrete implementation options |
| `/fd-volatility-map` | Show unstable code zones by churn and hotfix frequency |
| `/fd-regression-predict` | Estimate likely regression categories before making a change |
| `/fd-test-gap` | Identify weakly-tested areas in a proposed change |
| `/fd-review-route` | Route risky patches to security, backend, infra, or domain reviewers |
