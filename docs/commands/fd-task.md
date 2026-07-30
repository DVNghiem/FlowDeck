---
description: Define a task end to end — auto-init the workspace, research the codebase, confirm requirements, and save task.md + architecture.md + affect.md + plan.md
argument-hint: <task description>
---

# Task

Pipeline entrypoint. Turns a task description into the four confirmed artifacts every
later stage reads.

**Input:** $ARGUMENTS — the task description. REQUIRED.

If `$ARGUMENTS` is empty, the agent MUST prompt the user for a task description before
doing anything else. The agent MUST NOT guess or infer the task.

## Step 1: Auto-init

Check whether `~/.fd-plan/<slug>/` exists, where `<slug>` is the project directory name.

**MUST initialize if missing**:

1. Create `~/.fd-plan/<slug>/`.
2. Map the codebase with the graph:
   - Run `fdx-graph action:status` — it reports build age without paying for a build.
   - Absent or stale → run `fdx-graph action:build`. A no-op build is cheap and
     leaves the cache untouched.
   - Run `fdx-graph action:report` and read the generated `GRAPH_REPORT.md` for god
     nodes and cluster orientation.
   - For anything the graph does not cover (tech stack, dependency versions),
     delegate to `@mapper` or read `package.json` / `go.mod` / `Cargo.toml` /
     `pyproject.toml` plus the `src/` tree.
3. Write `~/.fd-plan/<slug>/architecture.md` — the project-level tech design:
   tech stack, module layout, entry points, established conventions, external
   dependencies.
4. Initialize `STATE.md` via `planning-state action:update` with `createDefaultState()`
   values, and create `~/.fd-plan/<slug>/config.json` with the default config.

Log: `"Initialized ~/.fd-plan/<slug>/ — project architecture mapped."`

**If it already exists**, skip init. The agent MUST NOT overwrite an existing `architecture.md`.

## Step 2: Research gate

Before searching anything, analyze the task description and propose what to research.

**2a. Propose queries**

From the task description, derive 3-5 specific research queries. Each query should target
a distinct area (e.g. existing implementation, relevant dependencies, affected modules,
prior decisions, external docs).

The agent MUST present them to the user:

```
Research plan for: "<task description>"

Proposed queries:
  1. <query>
  2. <query>
  3. <query>

[Y] Run these queries
[N] Skip research — go straight to discussion
[C] Use custom queries
```

**Wait for user input.** The agent MUST NOT proceed until the user responds.

---

**2b. Handle user choice**

**Y (or "yes" / Enter):**
Run all proposed queries using the available tools:
- Structural questions → `fdx-graph action:query target:<symbol>` for callers and
  callees, `fdx-graph action:impact target:<file>` for who depends on the files this
  task will touch, `fdx-graph action:explain target:<symbol>` for unfamiliar symbols.
- Text and pattern matching the graph does not cover → `fdx-search` / `fdx-grep` +
  `fdx-read --mode prototype`

Always also read:
- `~/.fd-plan/<slug>/architecture.md`
- `~/.fd-plan/<slug>/*/task.md` (prior topics)
- `AGENTS.md` / `CLAUDE.md`

Summarize findings in 3-5 bullets before continuing to Step 3.

---

**N (or "no" / "skip"):**
Skip all codebase research. Log: `"Research skipped by user."` Continue to Step 3 with
no research context. Orchestrator must note this in task.md under `## Constraints`:
`"Note: created without codebase research — may need revision after explore."`

---

**C (or "custom"):**
Ask: `"Enter your search queries (one per line):"`
Wait for user input. The agent MUST use the provided queries exactly as-is. The agent MUST NOT rewrite them.
Run them with the same tools as the Y path.
Summarize findings before continuing to Step 3.

## Step 3: Explore in parallel, then ask what research cannot answer

Spawn subagents to explore independent areas concurrently. Give each one the research
findings from Step 2 so it does not repeat work.

Then the agent MUST ask the user clarifying questions **one at a time**. The agent MUST NOT batch multiple questions together.

### Question suppression rule

Skip a question when:
1. The answer already exists in `architecture.md`, a prior `task.md`, or `STATE.md`
2. The answer is determinable from the tech stack or existing implementation patterns
3. It was already answered earlier in this session

Record every suppressed question and the evidence that answered it.

### Reuse suppression rule

Before proposing a new component, service, or utility in architecture.md:
1. Check `~/.fd-plan/<slug>/architecture.md` — does something already cover this?
2. Grep the codebase for an existing implementation.

If something already exists → the architecture should extend it, not duplicate it.
Note in `architecture.md` under "Alternatives Considered":
"<name> — reused existing <component> instead of building new."

Cover, in order, skipping whatever research already settled:

1. **Scope** — what must change, and what is explicitly out of scope
2. **Constraints** — technical constraints, dependencies, deadlines
3. **Acceptance criteria** — how we will know it is done
4. **Risks** — what could go wrong, known sharp edges

## Step 4: Draft the four artifacts

Draft all four before showing anything to the user. Every claim MUST trace to Step 2
evidence or a Step 3 answer. The agent MUST NOT guess.

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

**Wait for the user.** The agent MUST NOT write any file before CONFIRM. On requested changes,
return to Step 4 with the feedback.

## Step 6: Save

Derive `<topic>` as a lowercase, hyphenated slug of the task title.

Write to `~/.fd-plan/<slug>/<topic>/`:
- `task.md`
- `architecture.md`
- `affect.md`
- `plan.md`

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

- Empty `$ARGUMENTS` → ask for the task description; the agent MUST NOT guess one.
- Codebase mapping fails during init → report the failure and stop. A task planned
  against an unmapped codebase is not trustworthy.
- User never confirms → the agent MUST NOT write anything. No partial artifacts.

## Completion

Report: topic slug, artifact paths, requirement count, risk level, parallel/sequential
task split. Next step: `/fd-review`.
