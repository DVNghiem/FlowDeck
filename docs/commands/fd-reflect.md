# /fd-reflect

**Purpose:** Post-session reflection and skill capture — analyze session artifacts, propose improvements to FlowDeck's knowledge base, and optionally capture reusable skills from patterns discovered during the session.

## Usage

/fd-reflect [--mode=reflect,learn]

## What Happens

### Reflect Mode (default)

1. **Gather artifacts.** Call the `reflect` tool to collect session artifacts and generate reflection context.

2. **Analyze the session.**
   - Which tools were called most often? Any redundant calls?
   - Which decisions were made? Do they reveal a repeatable pattern?
   - Were there failures? What caused them?
   - What knowledge was absent and had to be worked out from scratch?

3. **Produce improvement proposals.**
   - **New skill** → call `create-skill` to capture it in `src/skills/`
   - **Policy** → propose a new entry in `.codebase/POLICIES.json` for user review
   - **Workflow change** → note it clearly for user to decide

4. **Execute skill creation** for any new skills identified.

5. **Final report.** Provide:
   - What was captured (new skills created)
   - What requires human review (policy proposals, workflow changes)
   - 3-5 bullet summary of the session's most impactful learnings

### Learn Mode (`--mode=learn`)

1. **Identify worth capturing.** Look for:
   - Novel problems requiring non-obvious solutions
   - Patterns that needed human guidance to resolve
   - Workflows or sequences that would save time if remembered
   - Pitfalls that were hit and corrected

   If nothing significant was found, reply: "No new patterns to capture from this session." and stop.

2. **Draft the skill.** Structure as:
   - `## When to Activate` — concrete triggers (e.g., "when X file pattern exists", "when user asks about Y")
   - `## Steps` — ordered, concrete steps to apply the skill
   - `## Examples` — at least one short concrete example
   - `## Pitfalls` — common mistakes to avoid

3. **Choose a name.** Use `$ARGUMENTS` if provided as skill name; otherwise derive a kebab-case name from the pattern.

4. **Write the skill** using the `create-skill` tool with:
   - `name`: kebab-case identifier
   - `description`: one sentence summary
   - `content`: full Markdown body
   - `tags`: 2-4 relevant tags

5. **Report** what was captured, why it is useful, and remind the user to restart OpenCode to activate it.

## Output / State

Files created (Learn mode):
- `src/skills/<name>.md` — new skill file

Files modified (Reflect mode):
- `.codebase/POLICIES.json` — proposed policy entries (user review needed)

## Examples

```
/fd-reflect
```

Run post-session reflection and produce improvement proposals.

```
/fd-reflect --mode=learn
```

Capture the most significant pattern from this session as a reusable skill.

```
/fd-reflect --mode=learn api-error-handling
```

Capture the session pattern as a skill named "api-error-handling".

## Related Commands

- `/fd-map-codebase` — map the codebase before starting a feature
- `/fd-execute` — run implementation (reflection happens after)
- `/fd-checkpoint` — save state before ending a session
