# /fd-translate-intent

**Purpose:** Convert vague requests into ranked concrete implementation options with tradeoffs.

## Usage

/fd-translate-intent [vague intent, e.g. "make checkout faster"]

## What Happens

Run two agents in parallel:

- **@architect**: Decomposes the input into 3-5 concrete implementation options. For each option provides:
  - **Name**: short label
  - **Description**: what exactly would be changed
  - **Files affected**: list of files/modules that would change
  - **Effort**: S (hours) / M (days) / L (week+)
  - **Risk**: low / medium / high
  - **Tradeoffs**: pros and cons

- **@researcher**: For each option, fetches relevant codebase context — finds existing patterns, prior art, and constraints that apply

## Output / State

Report format:
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

The command presents all options and asks: "Which option would you like to proceed with?"

## Examples

**Convert a vague request:**
```
/fd-translate-intent "make checkout faster"
```

**Translate a high-level request:**
```
/fd-translate-intent "improve auth security"
```

**Clarify a feature direction:**
```
/fd-translate-intent "add mobile support"
```

## Related Commands

- `/fd-discuss` — explore the problem space before translating intent
- `/fd-plan` — plan the selected implementation option
- `/fd-execute` — execute the chosen implementation