---
description: Maximum-effort autonomous execution — deep research, fixed pipeline, perfection loop. WARNING: consumes large amounts of tokens. Only use for tasks that justify the cost.
argument-hint: <task description>
---

⚠️  ULTRAWORK MODE
This command runs a full deep-research + execution + perfection loop.
Token cost is significantly higher than standard commands.
By running this command you accept the cost.
Estimated phases: Research → Discuss → Plan → Execute → Verify → Evaluate (loop) → Done

# UltraWork

Run maximum-effort autonomous execution for `$ARGUMENTS` using a fixed workflow. Do not shortcut phases to save tokens. Persist all state under `.planning/ultrawork/` so `/fd-resume` can continue the run.

**Input:** $ARGUMENTS — task description.

## Fixed Workflow Constraints

- Research phase is mandatory. Do not proceed if any required tool step is skipped without a logged reason in `.planning/ultrawork/RESEARCH.md`.
- `websearch` and `context7` are optional only when their MCP/tool connection is unavailable; log the skip and reason before Phase 1.
- Agents must read `.planning/ultrawork/RESEARCH.md` before execution and must not duplicate research.
- Only `@supervisor` interacts with the human via the `question` tool.
- All state is persisted under `.planning/ultrawork/` for `/fd-resume`.
- Orchestrator must not skip phases to save tokens.

## Phase 0 — Deep Research (mandatory, no skipping)

All steps are required regardless of task size. Execute in order.

Create `.planning/ultrawork/` and write all findings to `.planning/ultrawork/RESEARCH.md`, creating the file if missing.

1. Run `fdx-outline src/`          → understand full symbol structure
2. Run `fdx-impact <entry files>`  → dependency map of likely touch points
3. Run `repo-memory` action:search → prior lessons related to this task
4. Run `load-rules`                → active governance rules
5. Run `codebase-state`            → tech stack snapshot
6. Run `fdx-git log -n 20`         → recent change history
7. Run `websearch` / `context7`    → external knowledge (if MCP available)

Note: `fdx-outline` and `fdx-impact` are preferred over native tools for token efficiency. Fall back to `codebase-state` + `codegraph` if fdx is unavailable.

If `websearch` is unavailable, append `websearch skipped: <reason>` to `RESEARCH.md` before Phase 1.
If `context7` is unavailable, append `context7 skipped: <reason>` to `RESEARCH.md` before Phase 1.
If any required research tool is unavailable, append `<tool> skipped: <reason>` to `RESEARCH.md`; do not proceed until skip and reason are logged.

After all steps, append:

```markdown
## Research Summary

### Findings
- [finding]

### Risks
- [risk]

### Constraints
- [constraint]
```

The `Research Summary` is downstream source of truth for all later phases.

## Phase 1 — Agree on Done Criteria (mandatory human interaction)

Before planning or execution, `@supervisor` must use the `question` tool with separate calls:

1. Ask: `What does "done" look like?` Include options derived from task context.
2. Ask: `Max fix iterations before escalating?` Include options `1`, `2`, `3`, `custom`; default `3`.
3. Ask: `Any constraints research didn't surface?` Free text.

Write `.planning/ultrawork/STATE.md` as YAML:

```yaml
task: <task description>
done_criteria: <human answer>
max_iterations: <human answer>
extra_constraints: <human answer>
iteration: 0
status: planning
research_file: .planning/ultrawork/RESEARCH.md
```

## Phase 2 — Plan

1. Read `.planning/ultrawork/RESEARCH.md` and `.planning/ultrawork/STATE.md`.
2. Route to `@architect` if structural or architectural decisions are required; otherwise route to `@planner`.
3. Produce a plan that lists how each `done_criteria` item will be satisfied.
4. Route the plan to `@risk-analyst` for sign-off before proceeding.
5. Save plan to `.planning/ultrawork/PLAN.md` via `planning-state action: write_plan`.
6. Update `.planning/ultrawork/STATE.md` status to `executing`.

## Phase 3 — Execute

1. Increment `iteration` in `.planning/ultrawork/STATE.md`.
2. Route to specialists per `.planning/ultrawork/PLAN.md`.
3. Require each agent to read `.planning/ultrawork/RESEARCH.md` first and not re-research.
4. Log each completed step to `.planning/ultrawork/ITERATIONS.md`:

```markdown
## Iteration <N>
Steps completed: [list]
```

## Phase 4 — Verify

Run the full verification pipeline from `/fd-verify`:

- `@tester`
- `@reviewer`
- `@security-auditor`
- deploy check

Pass `DONE_CRITERIA` and `EXTRA_CONSTRAINTS` from `.planning/ultrawork/STATE.md` to each verification agent/check.

Append verification result to `.planning/ultrawork/ITERATIONS.md`:

```markdown
Verification: PASS | FAIL
Blocking issues: [list or "none"]
```

## Phase 5 — Evaluate

1. Compare `.planning/ultrawork/STATE.md` `done_criteria` to the verification result.
2. If all criteria are met, proceed to Phase 6.
3. If criteria are not met and `iteration < max_iterations`:
   - `@supervisor` asks the human with the `question` tool.
   - Show failures, fix plan, and options: `continue`, `adjust`, `abort`.
   - If `continue`, loop to Phase 3.
   - If `adjust`, update `.planning/ultrawork/PLAN.md`, then loop to Phase 3.
   - If `abort`, proceed to Phase 6 with result `ABORTED`.
4. If criteria are not met and `iteration == max_iterations`:
   - `@supervisor` asks the human with the `question` tool.
   - Show history summary, failures, and options: `try N more`, `accept current`, `abort`.
   - Record `escalation_decision` in `.planning/ultrawork/STATE.md`.
   - Execute the selected option.

## Phase 6 — Done

Write `.planning/ultrawork/REPORT.md`:

```markdown
# UltraWork Report

**Task:** <task>
**Iterations:** <N>
**Done criteria:** <criteria>
**Result:** COMPLETED | ACCEPTED BY HUMAN | ABORTED

## What Changed
[list of files changed with one-line summary each]

## Research Findings Applied
[key insights from RESEARCH.md that influenced decisions]

## Lessons
[anything worth recording in repo-memory]
```

For each lesson in the report, call `capture-lesson`.

Update `.planning/ultrawork/STATE.md` status:
- `done` when result is `COMPLETED`
- `accepted` when result is `ACCEPTED BY HUMAN`
- `aborted` when result is `ABORTED`

Print `.planning/ultrawork/REPORT.md` to chat. If result is `COMPLETED` or `ACCEPTED BY HUMAN`, suggest `/fd-done`.

## Completion

Report: final result, iteration count, changed files, verification status, report path, and suggested next step.
