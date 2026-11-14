---
description: Define a task from the current conversation or an explicit description, then save tier-appropriate artifacts
argument-hint: [task description]
---

# Task

Pipeline entrypoint. Turns a task description into confirmed, tier-appropriate artifacts.

**Input:** $ARGUMENTS — optional task description.

If `$ARGUMENTS` is empty, extract only requirements and decisions from conversation
history actually available in this session. Label each item `confirmed`, `proposed`,
or `unknown`, with short provenance when available. Show a concise preview and ask
for one confirmation before research or planning in STANDARD and FULL. FAST may skip
the preview only for an unambiguous, reversible task. If multiple unrelated tasks
appear, ask which one; if history is truncated, say what is missing. Never call an
inference confirmed. Explicit `$ARGUMENTS` takes precedence over inferred history.

Route before research: authentication, authorization, security, migration, public
API/schema compatibility, critical concurrency, infrastructure, production, or
cross-module high impact means FULL. A clear local low-risk change is FAST;
ordinary changes are STANDARD. Record `workflowClass: FAST|STANDARD|FULL` in state.
Uncertainty alone does not force FULL; ask one focused question or use STANDARD.

FAST writes `task.md` with inline mini-plan only. STANDARD writes `task.md` with
inline steps, plus `affect.md` only when multi-file impact justifies it. FULL writes
`task.md`, `architecture.md`, `affect.md`, and `plan.md`. All tiers require final
verification; only FULL requires independent review and execution approval.

## Step 1: Auto-init

Resolve the planning root through `planning-state action:read`'s `planning_root`
field and write initial STATE.md at its `state_path`, including when state does
not exist yet. In paths below, `<slug>` is that
resolved directory name, which contains a canonical-root hash for new projects;
never derive it from the project directory basename. Check whether that root exists.

**MUST initialize if missing**:

1. Create `~/.fd-plan/<slug>/`.
2. **MUST create `STATE.md` immediately after creating the planning directory.** Write
   `createDefaultState()` to `~/.fd-plan/<slug>/STATE.md`, then call
   `planning-state action:update` with:
   - `updates.status: "in_progress"`
   - `updates.plan_confirmed: false`
   - `updates.last_action: "fd-task started"`
   - `updates.next_action: "complete fd-task steps"`

   This ensures `fd-resume` has a fallback if the session is interrupted before
   artifacts are confirmed. Then create `~/.fd-plan/<slug>/config.json` with the
   default config.
3. Map the codebase with the graph when FDX is available:
   - Run `fdx-graph action:status` — it reports build age without paying for a build.
   - Absent or stale → run `fdx-graph action:build`. A no-op build is cheap and
     leaves the cache untouched.
   - Run `fdx-graph action:report` and read the generated `GRAPH_REPORT.md` for god
     nodes and cluster orientation.
   - For anything the graph does not cover (tech stack, dependency versions),
     delegate to `@mapper` or read `package.json` / `go.mod` / `Cargo.toml` /
     `pyproject.toml` plus the `src/` tree.
   - If FDX is missing or broken, use ordinary repository inspection and mark
     graph or impact conclusions unavailable; never invent graph results.
4. Write `~/.fd-plan/<slug>/architecture.md` — the project-level tech design:
   tech stack, module layout, entry points, established conventions, external
   dependencies.

Log: `"Initialized ~/.fd-plan/<slug>/ — project architecture mapped."`

**If it already exists**, skip init. The agent MUST NOT overwrite an existing `architecture.md`.

## Step 2: Research gate

Before searching anything, analyze the task description and propose what to research.

**2a. Propose queries**

From the task description, derive 3-5 specific research queries. Each query should target
a distinct area (e.g. existing implementation, relevant dependencies, affected modules,
prior decisions, external docs).

For FULL, present the queries to the user if they need a research decision.
For FAST and STANDARD, run relevant queries without another approval prompt:

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

When a research decision is requested, wait for user input. Otherwise continue.

---

**2b. Handle user choice**

**Y (or "yes" / Enter):**
Run all proposed queries using the available tools:
- Structural questions → `fdx-graph action:query target:<symbol>` for callers and
  callees, `fdx-graph action:impact target:<file>` for who depends on the files this
  task will touch, `fdx-graph action:explain target:<symbol>` for unfamiliar symbols.
- Text and pattern matching the graph does not cover → call `fdx-search` with `pattern`,
  `fdx-grep` with `pattern` and `paths`, then `fdx-read` with `file` and mode `prototype`.

Always also read:
- `~/.fd-plan/<slug>/architecture.md`
- `~/.fd-plan/<slug>/*/task.md` (prior topics)
- `AGENTS.md` / `CLAUDE.md`

If FDX is missing or broken, replace graph/search/read tool calls with ordinary
repository inspection and mark graph conclusions unavailable.

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

In FULL, spawn relevant specialists to explore independent areas concurrently.
In STANDARD, use `@mapper` only when discovery is needed and `@planner` only for
material ambiguity or multi-module change. FAST has no mandatory agent fan-out.
Give any delegated agent the research findings from Step 2 so it does not repeat work.

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

## Step 4: Draft tier-appropriate artifacts

Draft only the artifacts required by `workflowClass` before showing them. Every claim
MUST trace to evidence or a user answer. The agent MUST NOT guess. FAST uses an inline
mini-plan in `task.md`; STANDARD uses inline steps and adds `affect.md` only if needed.
The four templates below apply in FULL.

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

When FDX is available, resolve the affected file set with `fdx-graph action:impact target:<file>`, which
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

## Step 4b: Estimate complexity

In FULL, compute from affect.md:
- Files touched: <count>
- Risk level: <low|medium|high>
- Parallel waves: <count>
- Sequential bottlenecks: <count>

Map to estimate:
- 1-3 files, low risk, 1 wave → ~30 min
- 4-10 files, low/medium, 1-2 waves → ~2-4 hours
- 10+ files OR high risk OR 3+ waves → ~1 day+
- Cross-system (3+ affected systems) → add 50% buffer

Include the estimate with the FULL approval request; do not add another prompt.

## Step 5: PAUSE for CONFIRM

In FULL, present all four drafts, then print:

```
Ready to save these artifacts?
Type CONFIRM to save, or describe changes needed.
```

Wait for approval in FULL. FAST and STANDARD save tier-appropriate artifacts after
the conversation preview has been confirmed, if one was required. On requested
changes, return to Step 4 with the feedback.

## Step 6: Save

Derive `<topic>` as a lowercase, hyphenated slug of the task title.

Write the tier-appropriate files to `~/.fd-plan/<slug>/<topic>/`:
- `task.md`
- `architecture.md` (FULL only)
- `affect.md` (FULL, or justified STANDARD impact)
- `plan.md` (FULL only)

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
  next_action: "run /fd-review in FULL; otherwise /fd-execute when ready"
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

**MUST include `topic` and `current_command` — `fd-resume` depends on these fields.**

## Error Handling

- Empty `$ARGUMENTS` → ask for the task description; the agent MUST NOT guess one.
- Codebase mapping fails during init → report the failure and stop. A task planned
  against an unmapped codebase is not trustworthy.
- User never confirms → the agent MUST NOT write anything. No partial artifacts.

## Completion

Report: topic slug, artifact paths, requirement count, risk level, parallel/sequential
task split. Next step: `/fd-review`.
