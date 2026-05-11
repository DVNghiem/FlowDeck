---
description: Execute feature implementation workflow — orchestrator + role-routed implementation/researcher + reviewer + tester
argument-hint: "[feature-description]"
---

Execute a new feature using FlowDeck's multi-agent workflow.

**What this does:**
1. If a confirmed PLAN.md exists: delegates each step to `@backend-coder`, `@frontend-coder`, or `@devops` based on scope
2. If no plan: first runs discuss → plan → confirm, then executes
3. Runs `@researcher` in parallel for any external APIs or docs needed
4. Runs `@reviewer` after each significant step to catch issues early
5. Runs `@tester` to write and run tests for implemented code
6. Updates STATE.md after each step

**Phase gate:** Requires `plan_confirmed = true` in STATE.md before execution begins.

**Parallel execution:** Independent steps are delegated simultaneously to maximize speed.

## What Next?

1. **Review the code** → `/fd-verify`
2. **Write documentation** → `/fd-write-docs`
3. **Deploy check** → `/fd-deploy-check`
4. **Start next feature** → `/fd-new-feature [description]`
