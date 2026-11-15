---
description: Two-lens review of the task artifacts before execution — CEO review challenges scope and premise, eng review checks architecture, edge cases, and blast radius
argument-hint: [--topic=<slug>]
---

# Review

Review the artifacts `/fd-task` produced, through two independent lenses, before any
code is written.

**Input:** $ARGUMENTS — optional `--topic=<slug>` to review a topic other than the
active one.

## Step 1: Load artifacts

Resolve `<topic>` from `--topic`, else from `topic` in `<project-root>/.fd-plan/STATE.md`.

**MUST validate artifacts before review:**

Call `fdx-validate action:artifacts topic:<topic>`.

If `valid: false` → STOP. Print:

```
❌ Artifact validation failed. Fix these issues before fd-review:
  <error 1>
  <error 2>
Run /fd-task to regenerate the artifacts.
```

If `valid: true` → proceed to load the artifacts required by `workflowClass` in
STATE.md. Missing optional artifacts are valid; validate any optional artifact that is present.

Read `<project-root>/.fd-plan/<topic>/task.md` — requirements, acceptance criteria,
constraints, and (for FAST/STANDARD when no `plan.md` exists) the inline implementation
and verification steps.

For FULL, also read `architecture.md`, `affect.md`, and `plan.md`; these are required.
For STANDARD, read `affect.md` and `architecture.md` only when present; `plan.md` is optional.
For FAST, read and review `task.md`; any other artifact is optional.

If a required artifact is missing:

```
Error: <file> not found for topic "<topic>". Run /fd-task first.
```

Read `<project-root>/.fd-plan/architecture.md` for project-level context when present.

Also call: repo-memory action:search query:"review lessons <tech stack>"
The agent MUST load any prior review findings into context before starting CEO or eng review.

## Step 2: CEO review — challenge the premise

For FAST, perform a concise check of task clarity, acceptance/verification, and obvious risk;
do not require architecture, blast-radius, or wave analysis. For STANDARD and FULL, argue
with the task, not the code, and answer each applicable question explicitly:

1. **Is this the right problem?** Does solving it move anything that matters, or is it
   work for its own sake? What happens if we do nothing?
2. **Is this the right approach?** Is there a materially cheaper or simpler way to get
   the same outcome? Is any part of the scope speculative?
3. **Is the risk acceptable?** Given the risk level in `affect.md` when available, is the payoff worth
   the blast radius? What is the worst realistic outcome?
4. **Is the scope right?** What in `task.md` could be cut without losing the point?
   What is missing that would make this fail on delivery?

Be direct. If the premise is weak, say so plainly rather than hedging.

## Step 3: Eng review — challenge the design

1. **Architecture quality** — when `architecture.md` exists, does its design fit the project's
   established patterns from the project-level `architecture.md`? Does it introduce an
   abstraction that is used exactly once?
2. **Edge cases** — what inputs, states, or failure modes do the plan or inline steps not handle?
   Check boundaries, empty/absent values, concurrency, and partial failure.
3. **Test coverage** — does every acceptance criterion in `task.md` have a step that
   makes it verifiable? Which steps ship untested behavior?
4. **Blast radius** — when `affect.md` exists, cross-check it against the codebase. Use
  `fdx-graph action:impact target:<file>` (or call `fdx-impact` with `files`) on each affected file. Flag any dependent
   module the analysis missed, and any task pair classified **Can Parallel** whose
   file lists actually intersect.

## Step 4: Surface findings

Present both lenses in one report:

```
════════════════════════════════════════════════════
REVIEW: <topic>
════════════════════════════════════════════════════

CEO LENS
  Right problem:  ✅ | ⚠️  <concern>
  Right approach: ✅ | ⚠️  <concern>
  Risk:           ✅ acceptable | ⚠️  <concern>
  Scope:          ✅ | ⚠️  <cut this / add that>

ENG LENS
  Architecture:   ✅ | ⚠️  <finding>
  Edge cases:     <N> unhandled — <list>
  Test coverage:  <N>/<M> acceptance criteria covered
  Blast radius:   ✅ affect.md accurate | ⚠️  <missed dependency>

────────────────────────────────────────────────────
Blocking findings: <N>
Advisory findings: <N>
════════════════════════════════════════════════════
```

A finding is **blocking** when it would make the implementation wrong, unsafe, or
unverifiable. Everything else is advisory.

## Step 5: Confirm or revise

Print:

```
Type CONFIRM to accept these artifacts and proceed to /fd-execute,
or describe the revisions you want.
```

**Wait for the user.** The agent MUST NOT proceed until the user responds.

- **CONFIRM** → proceed to Step 6. The agent MUST record advisory findings that were accepted as-is.
- **Revisions requested** → apply them to the affected artifacts under
  `<project-root>/.fd-plan/<topic>/`, then re-run Steps 2–4 on the revised set.

The agent MUST NOT proceed past blocking findings without either fixing them or an explicit
user decision to accept the risk. The agent MUST record that decision.

## Step 5b: Capture lessons

Call capture-lesson with key findings from this review:
- Patterns flagged by CEO lens (scope creep, wrong problem, etc.)
- Patterns flagged by eng lens (architecture smells, blast radius concerns, etc.)

Format: "fd-review: <pattern> — <recommendation>"
These will be surfaced in future reviews via repo-memory.

## Step 6: Update state and checkpoint

```
planning-state action:update
  last_action: "Review complete — artifacts confirmed"
  next_action: "run /fd-execute"
```

If the task is UI-heavy and the design in `architecture.md` was approved here, also set
`design_stage: handoff_complete` and `design_approved: true`.

Update `<project-root>/.fd-plan/checkpoint.json`:

```json
{
  "current_command": "fd-review",
  "current_stage": "complete"
}
```

Merge into the existing file rather than replacing it.

## Error Handling

- Missing artifact → error naming the file and `/fd-task` as the remedy. The agent MUST NOT
  review a partial set.
- User never confirms → the agent MUST NOT change state and MUST NOT update the checkpoint.

## Completion

Report: blocking and advisory finding counts, any artifacts revised, accepted risks.
Next step: `/fd-execute`.
