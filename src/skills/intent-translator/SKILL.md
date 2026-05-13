---
name: intent-translator
description: Convert vague requests like "make checkout faster" into concrete, ranked implementation options with tradeoffs before coding starts.
origin: FlowDeck
---

# Intent-to-Change Translator

Run `/fd-translate-intent` with a plain-language description of what you want. Get back a ranked menu of concrete implementation options with tradeoffs — before writing a single line of code.

## When to Activate

- The request is vague ("make it faster", "improve reliability", "clean this up")
- Multiple valid approaches exist and the choice has significant consequences
- The user hasn't specified which files or systems to touch

## Workflow

1. Parse the intent: what outcome is the user seeking?
2. Search the codebase for relevant context:
   - What does the system currently do in this area?
   - What are the bottlenecks or pain points?
3. Generate ≤5 concrete implementation options, each with:
   - **Name**: short label
   - **Description**: 1–2 sentences of what it does
   - **Files affected**: list of files to touch
   - **Effort**: S (hours) / M (1–2 days) / L (week+)
   - **Risk**: low / medium / high
   - **Tradeoffs**: what you gain and what you give up
4. Rank options by impact-to-effort ratio (best first)
5. Ask clarifying questions if the intent is still ambiguous after step 2

## Output Format

```markdown
## Intent Translation: "[original intent]"

### Option 1 (Recommended): [Name]
**Description**: [what it does]
**Files**: [list]
**Effort**: S | M | L  **Risk**: low | medium | high
**Tradeoffs**: ✅ [gain] | ⚠️ [cost]

### Option 2: [Name]
...

### Clarifying Questions (if needed)
1. [question]

### Recommendation
Proceed with **Option 1** because [reason].
To start: run `/fd-plan` after confirming your choice.
```

## Confidence Rule

If the intent could mean two fundamentally different things, list both interpretations explicitly and ask the user to choose BEFORE generating options. Do not guess silently.
