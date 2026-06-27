---
description: Start a new feature — initialize feature context in .planning/, classify the task, select the adaptive workflow, and guide through the minimal sufficient stage sequence
argument-hint: [feature name or description]
---

# New Feature

Initialize a new feature and guide through the full FlowDeck feature workflow.

**Input:** $ARGUMENTS — name or short description of the feature to build

## Pre-flight

1. Check `.codebase/` exists — if not, error:
   > "Codebase mapping is required before starting a feature. Run `/fd-map-codebase` first to index the codebase."

2. If `.planning/STATE.md` does not exist:
   - Run `/fd-init-deep` first to initialize the workspace, then continue.
   - Do not create STATE.md manually.

3. If `.planning/STATE.md` exists: read it via `planning-state action:read` to get
   the current phase number N.

4. Create `.planning/phases/phase-<N>/` if it does not exist.

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

After creating FEATURE.md, update STATE.md via:
```
planning-state action:update
  last_action: "Feature initialized: $ARGUMENTS"
  next_action: "run /fd-discuss"
```
Do not write STATE.md directly.

### Step 4: Classify and Present Workflow

Classify the task using `classifyTask($ARGUMENTS)` and score it for routing.

Record the classification in STATE.md:
```yaml
workflowClass: <quick|standard|explore|ui-heavy|bugfix|docs-only|verify-heavy>
routingScores:
  simplicity: <0-1>
  confidence: <0-1>
  lowRisk: <0-1>
  knownCodebase: <0-1>
  cheapComplexity: <0-1>
  total: <0-1>
routingReason: <why this workflow was selected>
```

Report what was created and present the next steps based on workflow class:

For `quick` workflows:
```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   Workflow: quick (score: <total>)
   File: .planning/phases/phase-<N>/FEATURE.md

Next step:
  1. /fd-execute          — run implementation directly (discuss and plan skipped)
```

For `standard` workflows:
```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   Workflow: standard (score: <total>)
   File: .planning/phases/phase-<N>/FEATURE.md

Next steps (in order):
  1. /fd-plan             — create implementation plan
  2. /fd-execute          — run TDD pipeline to implement the plan
  3. /fd-verify           — run full test + review pipeline
```

For `explore` workflows:
```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   Workflow: explore (score: <total>)
   File: .planning/phases/phase-<N>/FEATURE.md

Next steps (in order):
  1. /fd-discuss          — capture requirements, scope, and acceptance criteria
  2. /fd-plan             — create implementation plan from discussion decisions
  3. /fd-execute          — run TDD pipeline to implement the plan
  4. /fd-verify           — run full test + review pipeline
```

For `ui-heavy` workflows:
```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   Workflow: ui-heavy (score: <total>)
   File: .planning/phases/phase-<N>/FEATURE.md

Next steps (in order):
  1. /fd-discuss          — capture requirements
  2. /fd-design           — create design system and wireframes
  3. /fd-plan             — create implementation plan
  4. /fd-execute          — run TDD pipeline
  5. /fd-verify           — run full test + review pipeline
```

For `bugfix` workflows:
```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   Workflow: bugfix (score: <total>)
   File: .planning/phases/phase-<N>/FEATURE.md

Next steps (in order):
  1. /fd-discuss          — reproduce and confirm the bug
  2. /fd-fix-bug          — fix with regression test
  3. /fd-verify           — verify the fix
```

For `docs-only` workflows:
```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   Workflow: docs-only (score: <total>)
   File: .planning/phases/phase-<N>/FEATURE.md

Next step:
  1. /fd-write-docs       — write documentation directly
```

For `verify-heavy` workflows:
```
✅ Feature initialized: $ARGUMENTS
   Phase: <N>
   Workflow: verify-heavy (score: <total>)
   File: .planning/phases/phase-<N>/FEATURE.md

Next steps (in order):
  1. /fd-plan             — create detailed implementation plan
  2. /fd-execute          — implement with enhanced verification
  3. /fd-verify           — run full test + security review + deploy-check
```

## Error Handling

- If `.codebase/` not found: error "Codebase mapping is required first. Run `/fd-map-codebase` to index the codebase."
- No partial state saved on error.

