---
description: Post-session reflection and skill capture — analyse artifacts, propose improvements, capture session patterns
argument-hint: [--mode=reflect,learn]
---

# Reflect

Analyse session artifacts and propose concrete improvements to FlowDeck's knowledge base.

**Input:** $ARGUMENTS — optional `--mode=reflect` (default) or `--mode=learn`

## Modes

### Reflect (default)
Post-session self-improvement analysis. See Steps below.

### Learn (`--mode=learn`)
Capture a repeatable pattern from this session as a reusable FlowDeck skill.

## Steps

1. Call the `reflect` tool to gather session artifacts and generate the reflection context.

2. Read the reflection context carefully:
   - Which tools were called most often? Were any called redundantly?
   - Which decisions were made? Do they reveal a repeatable pattern?
   - Were there any failures? What caused them?
   - What knowledge was absent and had to be worked out from scratch?

3. **Produce improvement proposals.** For each pattern or gap found:

   - **New skill** → call `create-skill` to capture it in `src/skills/`
   - **Policy** → propose a new entry in `.codebase/POLICIES.json` for the user to review
   - **Workflow change** → note it clearly so the user can decide

4. Execute any skill creation (step 3) now.

5. **Final report** — provide:
   - What was captured (new skills created)
   - What requires human review (policy proposals, workflow changes)
   - 3–5 bullet summary of this session's most impactful learnings

## Learn Mode

When `--mode=learn`:

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

3. **Choose the skill name.** Use `$ARGUMENTS` if provided as skill name, otherwise derive a kebab-case name from the pattern.

4. **Write the skill** using the `create-skill` tool with:
   - `name`: kebab-case identifier
   - `description`: one sentence summarising what the skill does
   - `content`: the full Markdown body from step 2
   - `tags`: 2–4 relevant tags

5. **Report** what was captured, why it is useful, and remind the user to restart OpenCode to activate it.
