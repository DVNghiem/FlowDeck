---
description: Intent-to-Change Translator — convert vague requests into 3–5 concrete, ranked implementation options with tradeoffs
argument-hint: [vague intent, e.g. "make checkout faster"]
---

# Translate Intent

Convert a vague request into concrete, ranked implementation options.

**Input:** $ARGUMENTS — a vague or high-level request (e.g., "make checkout faster", "improve auth security")

## Steps

Run two agents in parallel:

- **@architect**: Decompose `$ARGUMENTS` into 3–5 concrete implementation options. For each option provide:
  - **Name**: short label
  - **Description**: what exactly would be changed
  - **Files affected**: list of files/modules that would change
  - **Effort**: S (hours) / M (days) / L (week+)
  - **Risk**: low / medium / high
  - **Tradeoffs**: pros and cons

- **@researcher**: For each option, fetch relevant codebase context — find existing patterns, prior art, and constraints that apply

## Report

```
════════════════════════════════════════════
INTENT TRANSLATION: "$ARGUMENTS"
════════════════════════════════════════════

Option 1 (Recommended): <name>
  Description: <what changes>
  Files: <list>
  Effort: <S|M|L> | Risk: <low|med|high>
  Pros: <pros>
  Cons: <cons>

Option 2: <name>
  ...

Option 3: <name>
  ...

────────────────────────────────────────────
Clarifying Questions:
  1. <question about unclear aspect>
  2. <question>

Assumptions Made:
  - <assumption>
════════════════════════════════════════════
```

Present all options and ask: "Which option would you like to proceed with?"
