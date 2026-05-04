---
description: Capture a repeatable pattern from this session and save it as a reusable FlowDeck skill
argument-hint: [skill-name]
---

# Learn: Capture Session Knowledge

Review what happened in this session and create a reusable skill from the most significant learning.

**Input:** `$ARGUMENTS` — optional kebab-case name for the skill (the agent will choose one if omitted)

## Steps

1. **Identify what is worth capturing.** Look for:
   - A novel problem that required figuring out a non-obvious solution
   - A pattern that required human guidance or clarification to resolve
   - A workflow or sequence that would save significant time if remembered
   - A pitfall that was hit and corrected

   If nothing significant was discovered, reply: "No new patterns to capture from this session." and stop.

2. **Draft the skill.** Structure it as:
   - `## When to Activate` — concrete triggers (e.g., "when X file pattern exists", "when the user asks about Y")
   - `## Steps` — ordered, concrete steps to apply the skill
   - `## Examples` — at least one short, concrete example
   - `## Pitfalls` — common mistakes to avoid

3. **Choose the skill name.** Use `$ARGUMENTS` if provided, otherwise derive a kebab-case name from the pattern.

4. **Write the skill** using the `create-skill` tool with:
   - `name`: kebab-case identifier
   - `description`: one sentence summarising what the skill does
   - `content`: the full Markdown body from step 2
   - `tags`: 2–4 relevant tags

5. **Report** what was captured, why it is useful, and remind the user to restart OpenCode to activate it.
