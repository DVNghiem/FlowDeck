---
description: Extract requirements via structured Q&A — saves decisions to .planning/phases/phase-N/DISCUSS.md with D-XX numbering
argument-hint: [topic]
---

# Discuss

Run a structured requirements discussion session and capture decisions.

**Input:** $ARGUMENTS (optional topic to focus the discussion)

## Pre-flight

1. Check `.planning/STATE.md` exists — if not, return error: "Run /fd-new-project first."
2. Read current phase from STATE.md.
3. Create `.planning/phases/phase-<N>/` directory if it does not exist.

## Process

### Step 0: CodeGraph Intelligence Check

**Before any exploration**, check if codegraph provides existing code understanding:

```
codegraph action=check
```

- **If codegraph is installed and indexed (fresh)**: Use codegraph MCP tools to answer architecture, structure, and pattern questions directly. Prefer `codegraph_context`, `codegraph_search`, `codegraph_explore` over file reads.
  - Log: "codegraph available — using code intelligence index for preflight exploration"
- **If codegraph index is stale or has changed files**: Log "codegraph index may be stale — prefer direct verification for recent changes"
- **If codegraph is not installed or not indexed**: Log "codegraph not available — will explore via @code-explorer"

Use codegraph status to decide how Step 0 autonomous exploration is performed.

### Step 0b: Autonomous Codebase Exploration

**Before asking the user any question**, explore the repository to gather evidence.

**If codegraph is available (indexed and fresh):**
Use codegraph MCP tools directly for:
1. **Project structure** — `codegraph_context` to map entry points and module layout
2. **Tech stack detection** — `codegraph_files` and `codegraph_explore` on package manifests
3. **Implementation patterns** — `codegraph_explore` on `src/` for service/component patterns
4. Skip or minimally use @code-explorer — codegraph already provides the index

**If codegraph is NOT available:**
Invoke `@code-explorer` to inspect:
1. **Project files** — `.planning/PROJECT.md` (goals, tech stack, constraints)
2. **Session state** — `.planning/STATE.md` (current phase, prior decisions)
3. **Prior discussions** — `.planning/phases/*/DISCUSS.md` (already-captured decisions)
4. **Tech stack** — `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`
5. **Implementation patterns** — `src/` directory structure (services, components, api, etc.)
6. **AGENTS.md / rules** — any project-level constraints or conventions
7. **Relevant source files** — files matching keywords in `$ARGUMENTS`

In both cases, read:
- `.planning/phases/*/DISCUSS.md` for prior decisions
- `.codebase/CODEGRAPH.md` for codegraph index metadata if available

Store exploration findings in the discussion context. These will be used to:
- Skip questions whose answers are already known from the codebase
- Inform the `@discusser` agent with concrete evidence
- Prevent worker agents from emitting questions to the user


1. **Project files** — `.planning/PROJECT.md` (goals, tech stack, constraints)
2. **Session state** — `.planning/STATE.md` (current phase, prior decisions)
3. **Prior discussions** — `.planning/phases/*/DISCUSS.md` (already-captured decisions)
4. **Tech stack** — `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`
5. **Implementation patterns** — `src/` directory structure (services, components, api, etc.)
6. **AGENTS.md / rules** — any project-level constraints or conventions
7. **Relevant source files** — files matching keywords in `$ARGUMENTS`

Store exploration findings in the discussion context. These will be used to:
- Skip questions whose answers are already known from the codebase
- Inform the `@discusser` agent with concrete evidence
- Prevent worker agents from emitting questions to the user

### Question suppression rule

After exploration, apply the question guard before each `@discusser` question:

> A `@discusser` question is skipped if:
> 1. The answer already exists in `PROJECT.md`, `STATE.md`, or prior `DISCUSS.md` files
> 2. The answer is determinable from the tech stack / implementation patterns
> 3. The question was already answered in a prior session for this phase

If a question is suppressed, record it in the DISCUSS.md `## Suppressed Questions` section
with the evidence that answered it.

### Step 1: Load Context

Read `.planning/PROJECT.md` to understand the project vision and goals.
Read `.planning/STATE.md` to determine the current phase and context.
Read any prior `.planning/phases/phase-<N>/DISCUSS.md` for existing decisions.

Use exploration findings (from Step 0) to populate the discusser's starting context.

### Step 2: Determine Phase

Extract the current phase number from STATE.md.
Decisions will be saved to `.planning/phases/phase-{N}/DISCUSS.md`.

### Step 3: Invoke Discusser

Spawn @discusser agent with:
- Project context (from PROJECT.md)
- Current phase number
- **Preflight exploration findings** — the full ExplorationResult from Step 0, including:
  - `techStack`: detected tech stack (e.g. ["Node.js / JavaScript / TypeScript"])
  - `availableAgents`: list of registered agents
  - `availableCommands`: list of available commands
  - `implementationPatterns`: detected patterns (e.g. ["service layer", "agent architecture"])
  - `evidenceItems`: evidence that can answer common questions
  - `hasPriorDiscussions`: whether prior DISCUSS.md files exist
- Instructions to ask ONE question per turn using the RecommendedQuestion format
- Instructions to skip questions already answered by exploration evidence

### Step 4: Q&A Loop

The @discusser agent asks one question at a time using the RecommendedQuestion format.

Before each question:
1. Question guard check:
   - If the question can be answered from exploration evidence → skip it, record as suppressed
   - If the question was already asked in a prior session for this phase → skip it
   - Otherwise → proceed to validation
2. Recommendation validation:
   - Parse the question block with `parseQuestionBlocks()`
   - Validate with `validateRecommendedQuestion()`
   - If validation fails (bare question, missing fields) → return a rewrite hint to @discusser
   - If validation passes → format with `formatRecommendedQuestion()` and present to the user

After each user response:
- Assign D-XX number to any new decision
- Record: topic, choice, rationale
- If response conflicts with previous decision, flag the conflict

Continue until all required topics are covered or user says to stop early.

Structure the discussion (skip topics already answered by exploration):

1. **Scope** — What exactly needs to be built/changed? What is out of scope?
2. **Constraints** — Technical constraints, deadlines, dependencies?
3. **Acceptance criteria** — How will we know it's done?
4. **Risks** — What could go wrong? Any known issues?
5. **UI classification** — Is this task user-facing and UI-heavy (website/app/dashboard/admin/landing/onboarding)?

Ask questions one at a time. Wait for answers before proceeding.
Do not ask about things the codebase already reveals.

## Decision Recording

After the discussion, write `.planning/phases/phase-<N>/DISCUSS.md`:

```markdown
# Discussion: <topic>

**Phase:** <N>
**Date:** <timestamp>
**Topic:** <topic>

## Preflight Evidence Used

- Tech stack: <detected stack>
- Prior decisions loaded: <yes/no>
- Questions suppressed by evidence: <N>

## Decisions

D-01: [Topic] — [Decision] ([Rationale])
D-02: [Topic] — [Decision] ([Rationale])
...

## Answered Recommendations

RQ-01: [question]
  Recommendation: [the recommended answer]
  User choice: [what they said]
  Rationale: [why the system recommended it]
  Asked by: discusser
  Stage: discuss
  Timestamp: <ISO 8601>
...

## Suppressed Questions

(Questions that were answered by repo evidence and not asked of the user)
- "<question>" → answered by: <evidence source>
...

## Open Questions

- <any unresolved items>

## Next Steps

- Run /fd-plan to create implementation plan from these decisions
```

## D-05 Compliance

- Loads PROJECT.md + current phase STATE.md
- **Performs codebase exploration before any question is asked (Step 0)**
- Invokes @discusser agent with full exploration context
- Saves decisions with D-XX numbering to DISCUSS.md
- One question at a time (no compound questions)
- Questions suppressed when answered by evidence

## Completion

Report: decisions captured, questions suppressed, file path, and suggest running `/fd-plan`.
If UI-heavy, also suggest running `/fd-design --mode=draft` before `/fd-execute`.

## Error Handling

D-03: Fail fast with clear error
- If PROJECT.md not found: error with "Run /fd-new-project first"
- If STATE.md not found: error with "Project not initialized"
- If @discusser fails: error with "Discusser agent unavailable"
- If @code-explorer fails during preflight: proceed with reduced evidence (log warning)
- No partial state saved on error
