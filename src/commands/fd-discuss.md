---
description: Extract requirements via structured Q&A — saves decisions to .planning/phases/phase-N/DISCUSS.md with D-XX numbering
argument-hint: [topic]
---

# Discuss

Run a structured requirements discussion session and capture decisions.

**Input:** $ARGUMENTS (optional topic to focus the discussion)

## Pre-flight

1. Check `.planning/STATE.md` exists — if not, return error: "Run /fd-new-project first."
2. Read current phase from STATE.md.
3. Create `.planning/phases/phase-<N>/` directory if it does not exist.

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

Structure the discussion:

1. **Scope** — What exactly needs to be built/changed? What is out of scope?
2. **Constraints** — Technical constraints, deadlines, dependencies?
3. **Acceptance criteria** — How will we know it's done?
4. **Risks** — What could go wrong? Any known issues?
5. **UI classification** — Is this task user-facing and UI-heavy (website/app/dashboard/admin/landing/onboarding)?

Ask questions one at a time. Wait for answers before proceeding.

## Decision Recording

After the discussion, write `.planning/phases/phase-<N>/DISCUSS.md`:

```markdown
# Discussion: <topic>

**Phase:** <N>
**Date:** <timestamp>
**Topic:** <topic>

## Decisions

D-01: [Topic] — [Decision] ([Rationale])
D-02: [Topic] — [Decision] ([Rationale])
...

## Open Questions

- <any unresolved items>

## Next Steps

- Run /fd-plan to create implementation plan from these decisions
```

## D-05 Compliance

- Loads PROJECT.md + current phase STATE.md
- Invokes @discusser agent
- Saves decisions with D-XX numbering to DISCUSS.md
- One question at a time (no compound questions)

## Completion

Report: decisions captured, file path, and suggest running `/fd-plan`.
If UI-heavy, also suggest running `/fd-design --mode=draft` before `/fd-execute`.

## Error Handling

D-03: Fail fast with clear error
- If PROJECT.md not found: error with "Run /fd-new-project first"
- If STATE.md not found: error with "Project not initialized"
- If @discusser fails: error with "Discusser agent unavailable"
- No partial state saved on error
