---
description: Start a new feature — initialize feature context in .planning/, capture description, and guide through discuss → plan → execute → verify
argument-hint: [feature name or description]
---

# New Feature

Initialize a new feature and guide through the full FlowDeck feature workflow.

**Input:** $ARGUMENTS — name or short description of the feature to build

## Pre-flight

1. Check `.codebase/` exists — if not, error:
   > "Codebase mapping is required before starting a feature. Run `/fd-map-codebase` first to index the codebase."

2. If `.planning/` does not exist, initialize it now:
   - Create `.planning/` directory.
   - Create `.planning/STATE.md` with default initial state (phase 1, status: ready).
   - Create `.planning/config.json` with default settings:
     ```json
     { "model_profile": "balanced", "tdd_enforced": true, "approval_required": false, "default_agent": "orchestrator" }
     ```

3. Read `.planning/STATE.md` to determine the current phase number N (default: 1 if not set).
4. Create `.planning/phases/phase-<N>/` directory if it does not exist.

## Process

### Step 1: Capture Feature Description

If $ARGUMENTS is empty, ask the user:
> "What feature do you want to build? Describe it in one or two sentences."

Use the provided description as the feature name/summary.

### Step 2: Initialize Feature Context

Create `.planning/phases/phase-<N>/FEATURE.md`:

```markdown
# Feature: $ARGUMENTS

**Phase:** <N>
**Created:** <current timestamp>
**Status:** defined

## Description

$ARGUMENTS

## Acceptance Criteria

(to be defined in /fd-discuss)

## Out of Scope

(to be defined in /fd-discuss)
```

### Step 3: Update STATE.md

Update the current phase entry in STATE.md:
- Set `feature` to the feature name/description
- Set `status` to `defined`
- Set `last_action` to `"Feature defined: $ARGUMENTS"`

### Step 4: Present Feature Workflow

Report what was created and present the next steps clearly:

```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   File: .planning/phases/phase-<N>/FEATURE.md

Next steps (in order):
  1. /fd-discuss          — capture requirements, scope, and acceptance criteria
  2. /fd-plan             — create implementation plan from discussion decisions
  3. /fd-execute          — run TDD pipeline to implement the plan
  4. /fd-verify           — run full test + review + deploy-check pipeline
```

## Error Handling

- If `.codebase/` not found: error "Codebase mapping is required first. Run `/fd-map-codebase` to index the codebase."
- No partial state saved on error.

