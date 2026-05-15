---
name: confidence-aware-planning
description: Plan differently when the agent has low certainty — ask for clarification or narrow scope instead of pretending full understanding.
origin: FlowDeck
---

# Confidence-Aware Planning

Not every task comes with complete information. This skill enforces honest uncertainty signaling and adaptive planning when confidence is low.

## Confidence Levels

| Level | Meaning | Action |
|-------|---------|--------|
| HIGH (≥80%) | Well-understood scope, clear precedent in codebase | Proceed to plan normally |
| MEDIUM (40–79%) | Partial understanding, some unknowns | Surface assumptions, narrow scope, flag for review |
| LOW (<40%) | Significant unknowns, no clear precedent | Ask clarifying questions first, do not plan until answered |

## Signals That Lower Confidence

- Codebase section not covered in `.codebase/ARCHITECTURE.md`
- No prior DISCUSS.md for this feature area
- Request touches 5+ files with unclear dependencies
- Request uses domain jargon that doesn't appear in codebase
- No test coverage in the affected area (no test files found)
- File is in a volatile or critical zone per `.codebase/VOLATILITY.json`

## Workflow

Before planning ANY task:

1. Read relevant codebase docs (ARCHITECTURE.md, STACK.md, CONVENTIONS.md)
2. Scan affected files for context
3. Estimate confidence level
4. Act based on level:
   - HIGH: proceed to `/fd-plan`
   - MEDIUM: write explicit assumptions at the top of PLAN.md, flag 3 highest risks
   - LOW: stop, ask clarifying questions, do not write PLAN.md until answered

## Clarifying Question Format

When confidence is LOW, ask in this format:
```
Before I can plan this, I need to understand:

1. [Question about scope/behavior]
2. [Question about constraint or requirement]
3. [Question about existing system behavior]

I have LOW confidence because: [specific reason]
```

## Assumption Declaration Format

When confidence is MEDIUM, include at the top of every plan:
```markdown
## Assumptions (MEDIUM confidence)
- A1: [assumption] — if wrong, [consequence]
- A2: [assumption] — if wrong, [consequence]

## Risks
1. [risk]: [mitigation]
```

## Non-negotiable

Never write a plan that pretends HIGH confidence when the agent actually has LOW confidence. False certainty leads to wrong implementations and wasted effort.
