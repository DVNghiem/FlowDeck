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

## Discussion Process

Act as `@discusser` — a requirements analyst. Ask the user focused questions about the topic: **$ARGUMENTS**

Structure the discussion:

1. **Scope** — What exactly needs to be built/changed? What is out of scope?
2. **Constraints** — Technical constraints, deadlines, dependencies?
3. **Acceptance criteria** — How will we know it's done?
4. **Risks** — What could go wrong? Any known issues?

Ask questions one at a time. Wait for answers before proceeding.

## Decision Recording

As the user answers, extract decisions and number them `D-01`, `D-02`, etc.

After the discussion, write `.planning/phases/phase-<N>/DISCUSS.md`:

```markdown
# Discussion: <topic>

**Phase:** <N>
**Date:** <timestamp>
**Topic:** <topic>

## Decisions

D-01: <decision>
D-02: <decision>
...

## Open Questions

- <any unresolved items>

## Next Steps

- Run /fd-plan to create implementation plan from these decisions
```

## Completion

Report: decisions captured, file path, and suggest running `/fd-plan`.
