# /fd-discuss

**Purpose:** Structured pre-planning Q&A to capture decisions about scope, constraints, acceptance criteria, risks, and UI classification — saves decisions to DISCUSS.md with D-XX numbering.

## Usage

/fd-discuss [topic]

## What Happens

1. **Pre-flight checks.**
   - Verify `.planning/STATE.md` exists (error: "No active feature. Run `/fd-map-codebase` then `/fd-new-feature` to start a feature.")
   - Read current phase N from STATE.md
   - Create `.planning/phases/phase-<N>/` directory if needed

2. **CodeGraph intelligence check.**
   - Run `codegraph action=check`
   - If indexed and fresh: use `codegraph_context`, `codegraph_search`, `codegraph_explore` for preflight exploration
   - If stale or unavailable: fall back to `@code-explorer` for codebase exploration
   - Log which mode is active

3. **Autonomous codebase exploration (before any questions).**
   - Inspect PROJECT.md, STATE.md, prior DISCUSS.md files, tech stack manifests, src/ structure, and AGENTS.md/rules
   - Skip questions whose answers are already determinable from the codebase
   - Apply question guard: suppress any question answered by existing evidence

4. **Invoke @discusser agent.**
   - Agent receives project context, current phase, and full preflight exploration findings
   - Asks one question per turn using the RecommendedQuestion format
   - Each question is validated with `parseQuestionBlocks()` and `validateRecommendedQuestion()` before presentation

5. **Q&A loop.**
   - Questions presented one at a time covering: Scope, Constraints, Acceptance Criteria, Risks, UI Classification
   - Each answer is assigned a D-XX decision number and recorded with topic, choice, and rationale
   - Conflicts with prior decisions are flagged
   - Loop continues until all topics covered or user says to stop early

6. **Write DISCUSS.md.**
   - Saves to `.planning/phases/phase-<N>/DISCUSS.md`
   - Includes D-XX numbered decisions, suppressed questions (with evidence source), open questions, and next steps
   - If UI-heavy, suggests `/fd-design --mode=draft` before `/fd-execute`

## Output / State

File created:
- `.planning/phases/phase-<N>/DISCUSS.md`

DISCUSS.md structure:
```markdown
# Discussion: <topic>

**Phase:** <N>
**Date:** <timestamp>
**Topic:** <topic>

## Preflight Evidence Used
- Tech stack: <detected>
- Questions suppressed by evidence: <N>

## Decisions
D-01: [Topic] — [Decision] ([Rationale])
...

## Answered Recommendations
RQ-01: [question] | User choice: [answer] | Rationale: [why]

## Suppressed Questions
"<question>" → answered by: <evidence source>

## Open Questions
- <unresolved items>

## Next Steps
- Run /fd-plan to create implementation plan
```

## Examples

```
/fd-discuss user authentication
```

Runs a structured discussion on "user authentication", exploring scope, constraints, acceptance criteria, risks, and UI classification.

```
/fd-discuss
```

Runs a discussion with no pre-selected topic.

## Related Commands

- `/fd-new-feature` — define the feature before discussing
- `/fd-plan` — create implementation plan from DISCUSS.md decisions
- `/fd-design` — draft UI designs if the feature is UI-heavy
