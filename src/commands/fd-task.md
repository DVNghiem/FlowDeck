---
description: Start a new task — brainstorm, research, plan, and confirm before any code is written.
argument-hint: <topic>
---

# /fd-task <topic>

Runs the full pre-implementation pipeline for a task:
explorer → researcher → [architect] → [designer] → planner → CONFIRM

---

## Pre-flight

1. Check if a pending task exists in `.fd-plan/`:
   - Call `listPendingTasks()` to find tasks not in status "done"
   - If found: ask the user — "Found pending task: **<topic>** (status: <status>). Resume it or start a new task? [resume / new]"
   - If "resume": load the task state and continue from current stage
   - If "new": continue with the provided topic

2. Create task state:
   - `slug` = kebab-case of topic
   - `date` = today YYYY-MM-DD
   - `status` = "exploring"
   - Write `.fd-plan/<slug>/.state.json`
   - Create `.fd-plan/<slug>/` directory

---

## Stage 1: Explore

Delegate to `@explorer` via task tool with full topic and project context packet.

Wait for explorer to output the `exploration-summary` block.

Parse:
- `has_ui` → set `taskState.hasUI`
- `needs_architect` → set `taskState.needsArchitect`

Update status → "researching". Save state.

---

## Stage 2: Research

Delegate to `@researcher` with:
- Exploration summary
- Output path: `planFilePath(root, slug, date, "research")`
- Orchestrator context packet

Update status → "planning". Save state.

---

## Stage 3: Architect (conditional)

If `taskState.needsArchitect === true`:

Delegate to `@architect` with:
- Research file path
- Output paths:
  - `planFilePath(root, slug, date, "architect-affect")`
  - `.fd-plan/architect.md`
- Orchestrator context packet

If architect outputs `Recommendation: requires redesign`:
  - Stop pipeline
  - Report to user: "Architect requires redesign before planning can proceed. See: .fd-plan/<slug>/YYYY-MM-DD-<slug>-architect-affect.md"
  - Update status → "exploring". Save state.
  - Stop.

---

## Stage 4: Design (conditional)

If `taskState.hasUI === true`:

Delegate to `@designer` with:
- Research file path
- Architect-affect file path (if exists)
- Output path: `planFilePath(root, slug, date, "design")`
- Orchestrator context packet

---

## Stage 5: Plan

Delegate to `@planner` with:
- Research file path
- Architect-affect file path (if exists)
- Design file path (if exists)
- Output path: `planFilePath(root, slug, date, "plan")`
- Orchestrator context packet

Update status → "awaiting_confirm". Save state.

---

## Approval Gate

Print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plan ready for: <topic>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Review: .fd-plan/<slug>/YYYY-MM-DD-<slug>-plan.md

Type CONFIRM to proceed to /fd-execute.
Or describe changes needed and the planner will revise.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Wait for user response:
- "CONFIRM" → set `planConfirmed: true`, update status → "executing". Save state. Print: "Plan confirmed. Run /fd-execute to start implementation."
- Anything else → re-delegate to `@planner` with revision request. Repeat approval gate.

---

## Rules

- Never proceed past approval gate without explicit CONFIRM
- Always save state after each stage
- If any stage fails, update status and report to user with the exact file path of partial output
- Preserve context across re-runs via `.state.json` checkpoint
- Each stage output goes to timestamped `.fd-plan/<slug>/` directory
