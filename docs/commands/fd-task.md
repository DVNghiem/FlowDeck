---
description: Define a task end to end — auto-init the workspace, research the codebase, confirm requirements, and save task.md + architecture.md + affect.md + plan.md
argument-hint: <task description>
---

# Task

Pipeline entrypoint. Turns a task description into the four confirmed artifacts every
later stage reads.

**Input:** $ARGUMENTS — the task description. Required.

If `$ARGUMENTS` is empty, ask the user what they want to build before doing anything else.

## Step 1: Auto-init

Check whether `~/.fd-plan/<slug>/` exists, where `<slug>` is the project directory name.

**If it is missing**, initialize before continuing:

1. Create `~/.fd-plan/<slug>/`.
2. Map the codebase. Prefer codegraph when it is indexed and fresh:
   ```
   codegraph action=check
   ```
   - Indexed and fresh → use `codegraph_context` and `codegraph_files` to survey entry
     points, module layout, and tech stack.
   - Absent or stale → delegate the map to `@mapper`, or fall back to reading
     `package.json` / `go.mod` / `Cargo.toml` / `pyproject.toml` plus the `src/` tree.
3. Write `~/.fd-plan/<slug>/architecture.md` — the project-level tech design:
   tech stack, module layout, entry points, established conventions, external
   dependencies.
4. Initialize `STATE.md` via `planning-state action:update` with `createDefaultState()`
   values, and create `~/.fd-plan/<slug>/config.json` with the default config.

Log: `"Initialized ~/.fd-plan/<slug>/ — project architecture mapped."`

**If it already exists**, skip init. Never overwrite an existing `architecture.md`.

## Step 2: Research the codebase

Gather evidence relevant to *this* task before asking the user anything.

**If codegraph is available:**
- `codegraph_context` on the task keywords — the affected area
- `codegraph_impact` on each candidate entry point — blast radius
- `codegraph_explore` for the source of the symbols surfaced above

**If codegraph is not available:**
- `fdx-search` / `fdx-grep` for the task keywords, then `fdx-read --mode prototype`
- Fall back to native grep/read only when fdx errors

Also read:
- `~/.fd-plan/<slug>/architecture.md` — project tech design
- `~/.fd-plan/<slug>/*/task.md` — prior topics, to avoid re-litigating settled decisions
- `AGENTS.md` / `CLAUDE.md` — project constraints and conventions

## Step 3: Explore in parallel, then ask what research cannot answer

Spawn subagents to explore independent areas concurrently. Give each one the research
findings from Step 2 so it does not repeat work.

Then ask the user clarifying questions **one at a time**.

### Question suppression rule

Skip a question when:
1. The answer already exists in `architecture.md`, a prior `task.md`, or `STATE.md`
2. The answer is determinable from the tech stack or existing implementation patterns
3. It was already answered earlier in this session

Record every suppressed question and the evidence that answered it.

Cover, in order, skipping whatever research already settled:

1. **Scope** — what must change, and what is explicitly out of scope
2. **Constraints** — technical constraints, dependencies, deadlines
3. **Acceptance criteria** — how we will know it is done
4. **Risks** — what could go wrong, known sharp edges

## Step 4: Draft the four artifacts

Draft all four before showing anything to the user. Every claim must trace to Step 2
evidence or a Step 3 answer — do not guess.

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

Resolve the affected file set with `codegraph_impact`, or `fdx-impact` when codegraph
is unavailable.

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

## Step: Estimate complexity

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

Show to user before CONFIRM:
"Estimated effort: ~<X> — <reason>. Proceed?"

## Step 5: PAUSE for CONFIRM

Present all four drafts, then print:

```
Ready to save these artifacts?
Type CONFIRM to save, or describe changes needed.
```

**Wait for the user.** Do not write any file before CONFIRM. On requested changes,
return to Step 4 with the feedback.

## Step 6: Save

Derive `<topic>` as a lowercase, hyphenated slug of the task title.

Write to `~/.fd-plan/<slug>/<topic>/`:
- `task.md`
- `architecture.md`
- `affect.md`
- `plan.md`

Then record the topic and confirmation:

```
planning-state action:update
  topic: "<topic>"
  plan_confirmed: true
  last_action: "Task artifacts confirmed and saved"
  next_action: "run /fd-review"
```

## Step 7: Update checkpoint

Update `~/.fd-plan/<slug>/checkpoint.json`:

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

## Error Handling

- Empty `$ARGUMENTS` → ask for the task description; do not guess one.
- Codebase mapping fails during init → report the failure and stop. A task planned
  against an unmapped codebase is not trustworthy.
- User never confirms → nothing is written. No partial artifacts.

## Completion

Report: topic slug, artifact paths, requirement count, risk level, parallel/sequential
task split. Next step: `/fd-review`.
