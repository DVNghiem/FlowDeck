---
name: discuss-flow
description: "Orchestrates discuss phase (context load → @discusser Q&A → pause → decisions → save)"
triggers:
  - /discuss
steps:
  - name: load_context
    agent: "@orchestrator"
    priority: first
    action: Load PROJECT.md and current phase STATE.md
  - name: determine_phase
    agent: "@orchestrator"
    action: Extract current phase number from STATE.md
  - name: invoke_discusser
    agent: "@discusser"
    action: Spawn @discusser agent with project context
  - name: qa_loop
    agent: "@discusser"
    action: Discusser asks one question at a time; user responds; repeat until all topics covered
  - name: save_decisions
    agent: "@discusser"
    action: Write all decisions to .planning/phases/phase-N/DISCUSS.md with D-XX numbering
  - name: confirm_discuss
    agent: "@orchestrator"
    action: Present summary to user; require explicit confirmation before marking DISCUSS.md as confirmed
---

# Discuss Flow

## Purpose

Extract project requirements and decisions via structured Q&A with the @discusser agent.

## Process

### Step 1: Load Context

Read `.planning/PROJECT.md` to understand the project vision and goals.
Read `.planning/STATE.md` to determine the current phase and context.

### Step 2: Determine Phase

Extract the current phase number from STATE.md.
Decisions will be saved to `.planning/phases/phase-{N}/DISCUSS.md`.

### Step 3: Invoke Discusser

Spawn @discusser agent with:
- Project context (from PROJECT.md)
- Current phase number
- Instructions to ask ONE question per turn

### Step 4: Q&A Loop

The @discusser agent asks one question at a time.
After each user response:
- Assign D-XX number to any new decision
- Record: topic, choice, rationale
- If response conflicts with previous decision, flag the conflict

Continue until all required topics are covered or user says to stop early.

### Step 5: Save Decisions

Save all decisions to `.planning/phases/phase-N/DISCUSS.md`:
```
D-01: [Topic] — [Decision] ([Rationale])
D-02: [Topic] — [Decision] ([Rationale])
...
```

### Step 6: Confirm Discuss

Present summary of decisions to user.
Ask for explicit confirmation: "CONFIRMED" to proceed or "REVISION NEEDED" to revisit.

If user confirms:
- Update STATE.md to mark DISCUSS.md as confirmed
- Proceed to plan phase

If user requests revision:
- Return to Step 4 (Q&A loop) for the specified topics

## D-05 Compliance

- Loads PROJECT.md + current phase STATE.md
- Invokes @discusser agent
- Saves decisions with D-XX numbering to DISCUSS.md
- One question at a time (no compound questions)

## Error Handling

D-03: Fail fast with clear error
- If PROJECT.md not found: error with "Run /new-project first"
- If STATE.md not found: error with "Project not initialized"
- If @discusser fails: error with "Discusser agent unavailable"
- No partial state saved on error