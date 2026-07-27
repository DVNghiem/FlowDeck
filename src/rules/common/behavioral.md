---
description: Core behavioral guidelines for all agents — think before coding, the solution ladder, simplicity, surgical changes
always_on: true
stages: []
languages: []
---

# Behavioral Guidelines

## 1. Think Before Coding

Before implementing anything:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so.
- If something is unclear, stop. Name what's confusing. Ask.

The ladder runs **after** understanding the problem, not instead of it.
Read the code the change touches and trace the real flow before picking a rung.
**Lazy about the solution, never about reading.**

## 2. The Solution Ladder

Before writing any code, stop at the first rung that holds:

```
1. Does this need to exist?        → no: skip it (YAGNI)
2. Already in this codebase?       → reuse it, don't rewrite
3. Stdlib does it?                 → use it
4. Native platform feature?        → use it
5. Installed dependency?           → use it
6. One line?                       → one line
7. Only then: the minimum that works
```

Run the ladder per task during planning (fd-task) and again per implementation step during execution (fd-execute).

**Lazy, not negligent.** These are never on the chopping block regardless of the ladder:
- Trust-boundary input validation
- Error handling and data-loss prevention
- Security controls
- Accessibility

The goal is not fewest tokens. Write only what the task needs — the code ends up small because it is necessary, not golfed.

## 3. Surgical Changes

When editing existing code:
- Don't improve adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Every changed line must trace directly to the task requirement.

## 4. Goal-Driven Execution

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria let you loop independently.
