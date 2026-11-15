---
description: Plan work from the current conversation or an explicit task description, with risk-tiered artifacts
argument-hint: [task description]
---

# Task

Pipeline entrypoint. Uses one planning pipeline for conversation-derived and explicit
tasks, and writes only the artifacts required by the task's risk tier.

**Input:** `$ARGUMENTS` may be empty.

If `$ARGUMENTS` is empty, extract from the conversation available to OpenCode:
confirmed requirements and decisions, constraints, acceptance criteria, rejected
alternatives, and open questions. Do not promote brainstorming or tentative ideas to
requirements. If the available context omits earlier discussion, say so. If several
competing tasks are present, ask which one to plan. Do not invent a task description.

If `$ARGUMENTS` is non-empty, use it as the task description and use conversation
context only when relevant and non-contradictory.

## Step 0: Classify and confirm proportionately

Classify by observable impact and hard risk triggers, not word count. Record the exact
`workflowClass` value in STATE.md as `FAST`, `STANDARD`, or `FULL`.

- **FAST:** localized, low-risk change such as a typo, docs, styling, or a trivial
  refactor; no public API/schema, security, migration, concurrency, or infrastructure
  impact. If intent is unambiguous, skip the preview and ask no planning questions.
- **STANDARD:** multi-step feature or moderate change without a FULL trigger. If the
  task came from conversation, show a short preview of confirmed requirements,
  decisions, constraints, acceptance criteria, and unresolved questions, then request
  one confirmation before discovery or durable planning. Explicit descriptions use
  the same preview when STANDARD, without a separate extraction confirmation.
- **FULL:** auth/security, migrations, public APIs/schema, concurrency, infrastructure,
  or broad architectural changes. Show the same short preview and request one
  confirmation before discovery; require explicit plan approval before execution.

On rejection, revise the preview and request confirmation once for the revised version.
Do not repeat questions whose answers are already confirmed. Then continue through the
same existing `/fd-task` pipeline below.

If a legacy `~/.fd-plan/<project-basename>/` directory exists with no `.project-root`
marker, explain that the old slug-only path may belong to a different same-named project
or worktree. Ask whether to copy its missing files into the local `.fd-plan/`. Only after
explicit confirmation call `planning-state action=migrate_legacy`. This copies without
overwriting local files and keeps the global source. If declined, continue with local
state only. A matching root marker migrates automatically; a marker naming another root
must be left untouched and reported as belonging to that other project.

## Step 1: Auto-init

Resolve the OpenCode project root from the provided project context. Do not climb into
an unrelated parent repository. Call `planning-state action=ensure` to create
`<project-root>/.fd-plan/`, add the exact root-anchored `/.fd-plan/` rule without
changing existing ignore rules, and migrate any legacy state with a matching root
marker.

**MUST initialize if missing**:

1. Create `<project-root>/.fd-plan/`.
2. **MUST create `STATE.md` immediately after creating the planning directory.** Write
   `createDefaultState()` to `<project-root>/.fd-plan/STATE.md`, then call
   `planning-state action:update` with:
   - `updates.status: "in_progress"`
   - `updates.plan_confirmed: false`
   - `updates.workflowClass: "<FAST|STANDARD|FULL>"`
   - `updates.last_action: "fd-task started"`
   - `updates.next_action: "complete fd-task steps"`

   This ensures `fd-resume` has a fallback if the session is interrupted before
   artifacts are confirmed. Then create `<project-root>/.fd-plan/config.json` with the
   default config.
3. For STANDARD and FULL, map the codebase with the graph:
   - Run `fdx-graph action:status` — it reports build age without paying for a build.
   - Absent or stale → run `fdx-graph action:build`. A no-op build is cheap and
     leaves the cache untouched.
   - Run `fdx-graph action:report` and read the generated `GRAPH_REPORT.md` for god
     nodes and cluster orientation.
   - For anything the graph does not cover (tech stack, dependency versions),
     delegate to `@mapper` or read `package.json` / `go.mod` / `Cargo.toml` /
     `pyproject.toml` plus the `src/` tree.
4. For STANDARD and FULL, write `<project-root>/.fd-plan/architecture.md` — the project-level tech design:
   tech stack, module layout, entry points, established conventions, external
   dependencies.

Log: `"Initialized <project-root>/.fd-plan/ — project architecture mapped."`

**If it already exists**, skip init. The agent MUST NOT overwrite an existing `architecture.md`.
After the required preview confirmation, if any, call `planning-state action:update`
with `updates.workflowClass` set to the selected tier before discovery. Do this for
FAST too, even when its preview is skipped and the planning directory already exists.

## Step 2: Proportionate research

FAST skips formal research unless an unknown fact blocks safe implementation. STANDARD
and FULL investigate only material questions not answered by confirmed context. This is
part of the existing pipeline; do not add another approval prompt. Use the available
tools for graph queries and text search only when they answer a relevant question.
Always read the project architecture and prior task artifacts when they exist. Summarize
relevant findings in 3-5 bullets. If research is unnecessary or unavailable, record that
limitation under Constraints in `task.md`.

## Step 3: Explore and ask only what remains unresolved

Explore only what is warranted by the tier. FAST uses lightweight local inspection and
skips planner/architect/researcher unless a concrete risk or unknown requires them.
STANDARD uses mapper for multi-file impact, planner for material ambiguity or
dependencies, architect for architectural impact, and researcher only for unknown
external facts. FULL requires planner, architect, and impact mapping; use other agents
only when warranted. Parallelize only independent work on disjoint files. Pass prior
research findings so agents do not repeat work.

Then the agent MUST ask the user clarifying questions **one at a time**. The agent MUST NOT batch multiple questions together.

### Question suppression rule

Skip a question when:
1. The answer already exists in `architecture.md`, a prior `task.md`, or `STATE.md`
2. The answer is determinable from the tech stack or existing implementation patterns
3. It was already answered earlier in this session

Record every suppressed question and the evidence that answered it.

### Reuse suppression rule

Before proposing a new component, service, or utility in architecture.md:
1. Check `<project-root>/.fd-plan/architecture.md` — does something already cover this?
2. Grep the codebase for an existing implementation.

If something already exists → the architecture should extend it, not duplicate it.
Note in `architecture.md` under "Alternatives Considered":
"<name> — reused existing <component> instead of building new."

Cover, in order, skipping whatever research already settled:

1. **Scope** — what must change, and what is explicitly out of scope
2. **Constraints** — technical constraints, dependencies, deadlines
3. **Acceptance criteria** — how we will know it is done
4. **Risks** — what could go wrong, known sharp edges

## Step 4: Draft tier-required artifacts

Draft only the artifacts required by the tier. Claims must trace to confirmed context,
research evidence, or user answers; distinguish unresolved questions rather than guess.

- FAST: `task.md` only, including a short inline implementation and verification plan.
- STANDARD: `task.md`; add `affect.md` only for multiple files/components or material
  impact. Add architecture or plan details when needed by material risk.
- FULL: all four artifacts (`task.md`, `architecture.md`, `affect.md`, `plan.md`).

### `task.md` — confirmed requirements

```md
# Task: <title>

**Created:** <ISO timestamp>

## Requirements
- R-01: <requirement>
- R-02: <requirement>

## Out of Scope
- <explicitly excluded item>

## Acceptance Criteria
- [ ] <verifiable criterion>

## Constraints
- <constraint>

## Open Questions
- <unresolved item, or "none">

## Suppressed Questions
- "<question>" → answered by: <evidence source>
```

### `architecture.md` — tech design for this task

```md
# Architecture: <title>

## Approach
<the chosen design, in a paragraph>

## Components
- <component>: <responsibility>

## Data Flow
<how the pieces connect>

## Alternatives Considered
- <alternative> — rejected because <reason>
```

### `affect.md` — blast radius and parallel safety

Resolve the affected file set with `fdx-graph action:impact target:<file>`, which
reports blast radius with risk banding. Use `fdx-impact` for a multi-file query.

```md
# Affect Analysis
Generated: <ISO timestamp>

## Affected Files
- path/to/file.ts (modify|create|delete)

## Affected Systems
- <system>: <reason>

## Risk Level
low | medium | high

## Parallel Safety
### Can Parallel
- Task A: [file1.ts, file2.ts]
- Task B: [file3.ts, file4.ts]
### Must Sequential
- Task C (depends on A): [file1.ts, file3.ts]
```

Rules:
- Every task in `plan.md` must appear exactly once under **Can Parallel** or
  **Must Sequential**.
- A task belongs under **Must Sequential** when its file list intersects another
  task's file list, or when it declares a dependency on another task.
- **Risk Level** is `high` for security-sensitive, schema, or breaking changes;
  `medium` for shared modules or public API; otherwise `low`.

### `plan.md` — implementation steps

```md
# Plan: <title>

## Wave 1
- [ ] Step 1: <action> (traces: R-01) — files: [file1.ts]
- [ ] Step 2: <action> (traces: R-02) — files: [file2.ts]

## Wave 2
- [ ] Step 3: <action> (traces: R-03) — files: [file1.ts, file3.ts]
```

Every step traces to at least one `R-XX` requirement from `task.md`. Steps in the same
wave have no dependencies on each other.

## Step 4b: Estimate complexity (STANDARD and FULL)

From affect.md, compute:
- Files touched: <count>
- Risk level: <low|medium|high>
- Parallel waves: <count>
- Sequential bottlenecks: <count>

Map to estimate:
- 1-3 files, low risk, 1 wave → ~30 min
- 4-10 files, low/medium, 1-2 waves → ~2-4 hours
- 10+ files OR high risk OR 3+ waves → ~1 day+
- Cross-system (3+ affected systems) → add 50% buffer

Show the estimate as context: "Estimated effort: ~<X> — <reason>." Do not ask for
another confirmation here; the preview already authorized STANDARD planning, and FULL
plan approval happens once in Step 5.

## Step 5: Tier approval

For FAST and STANDARD, the preview confirmation already authorized planning. Show the
drafts and save after validation without asking for another confirmation. For FULL,
present all four drafts and print:

```
Ready to save these artifacts?
Type CONFIRM to save, or describe changes needed.
```

Wait for explicit CONFIRM before saving a FULL plan. On requested changes, revise the
draft and request plan approval again. Never write partial artifacts before approval.

## Step 6: Save

Derive `<topic>` as a lowercase, hyphenated slug of the task title.

Write only the tier-required files to `<project-root>/.fd-plan/<topic>/`:
- FAST: `task.md`
- STANDARD: `task.md`, plus `affect.md` when justified
- FULL: `task.md`, `architecture.md`, `affect.md`, and `plan.md`

**After saving, MUST run artifact validation:**

Call `fdx-validate action:artifacts topic:<topic>`.

If `valid: false`:
- Print each error clearly.
- Return to Step 4 with the errors as feedback.
- MUST NOT update checkpoint or planning-state until validation passes.

If `valid: true`:
- Log: "Artifacts validated ✅"
- Continue to Step 7 (checkpoint update).

Then record the topic and confirmation:

```
planning-state action:update
  topic: "<topic>"
  plan_confirmed: true
  last_action: "Task artifacts confirmed and saved"
  next_action: "run /fd-review"
```

## Step 7: Update checkpoint

Update `<project-root>/.fd-plan/checkpoint.json`:

```json
{
  "version": "1",
  "project": "<slug>",
  "topic": "<topic>",
  "current_command": "fd-task",
  "current_stage": "complete",
  "saved_at": "<ISO timestamp>"
}
```

Merge into the existing file rather than replacing it.

**MUST include `topic` and `current_command` — `fd-resume` depends on these fields.**

## Error Handling

- Ambiguous conversation with multiple candidate tasks → ask which task to plan.
- Missing conversation history → disclose the context gap and use only what is available.
- Codebase mapping fails during init → report the failure and stop. A task planned
  against an unmapped codebase is not trustworthy.
- STANDARD/FULL preview rejected → revise it before any discovery or durable planning.
- FULL plan never confirmed → the agent MUST NOT write artifacts. No partial artifacts.

## Completion

Report: topic slug, tier, artifact paths, requirement count, known open questions, and
verification/risk routing. Next step: `/fd-review` for STANDARD/FULL; FAST proceeds to
targeted verification and `/fd-done`.
