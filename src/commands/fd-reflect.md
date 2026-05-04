---
description: Post-session reflection — analyse artifacts and propose self-improvement actions
---

# Reflect: Self-Improvement Analysis

Analyse session artifacts and propose concrete improvements to FlowDeck's knowledge base.

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
