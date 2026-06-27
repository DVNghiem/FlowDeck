---
description: Initialize .planning/ workspace — create STATE.md, config.json, and phase-1 directory. Run this once per project before any other FlowDeck command.
argument-hint: [--reset]
---

# Initialize Planning Workspace

Set up the `.planning/` directory for this project.
Pass `--reset` to wipe and reinitialize an existing workspace (prompts for confirmation first).

## Pre-flight

1. If `--reset` was passed and `.planning/` exists:
   - Ask: "This will delete all existing planning state. Are you sure? [y/N]"
   - If N: abort.
   - If Y: delete `.planning/` entirely and continue.

2. If `.planning/STATE.md` already exists and `--reset` was NOT passed:
   - Read `.planning/STATE.md` via `planning-state action:read`.
   - Print: "✅ .planning/ already initialized (phase <N>, status: <status>)"
   - Show current state summary and exit. Do not reinitialize.

## Steps

### Step 1: Create directory structure

Create the following, skipping any that already exist:
- `.planning/`
- `.planning/phases/`
- `.planning/phases/phase-1/`

### Step 2: Write STATE.md

Write `.planning/STATE.md` using the canonical format from `createDefaultState()`:

```
---
phase: 1
status: ready
plan_confirmed: false
requires_design_first: false
design_stage: pending
design_approved: false
design_override: false
steps_complete: []
steps_pending: []
last_action: "initialized"
next_action: "run /fd-discuss or /fd-plan"
blockers: []
freshnessStatus: "fresh"
lastUpdatedAt: <ISO timestamp>
lastUpdatedBy: "system"
lastUpdatedPhase: 1
summaryVersion: 1
---

# Planning State

Initialized at <ISO timestamp>
```

### Step 3: Write config.json

Write `.planning/config.json` using `createDefaultConfig()`:

```json
{
  "model_profile": "balanced",
  "tdd_enforced": true,
  "approval_required": false,
  "default_agent": "orchestrator"
}
```

### Step 4: Write PROJECT.md if missing

If `.planning/PROJECT.md` does not exist, create a stub:

```markdown
# Project

**Tech stack:** (fill in)
**Goals:** (fill in)
**Constraints:** (fill in)
**Key contacts:** (fill in)
```

### Step 5: Confirm

Print:

```
✅ .planning/ initialized
   STATE.md       → phase 1, status: ready
   config.json    → balanced profile, TDD enforced
   phases/phase-1/ → ready

Next steps:
  /fd-discuss     — extract requirements
  /fd-plan        — create implementation plan
  /fd-new-feature — start a feature
```
