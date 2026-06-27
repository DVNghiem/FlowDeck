# /fd-ultrawork

**Purpose:** Maximum-effort autonomous execution — deep research, fixed pipeline, and a verify-evaluate loop until done criteria are met.

> ⚠️ **Cost warning** — token consumption is significantly higher than any other FlowDeck command. Mandatory research, full verification, and a retry loop make each run expensive. Only invoke when the task justifies the spend.

## Usage

```
/fd-ultrawork <task description>
```

## When to Use

Use `/fd-ultrawork` when the best possible result matters more than token cost:

- Greenfield architecture or major refactors
- Security-sensitive changes that need deep research and thorough review
- Complex multi-file work with ambiguous acceptance criteria
- Problems where partial answers are worse than no answer

Do **not** use it for routine work. For everyday tasks, prefer `/fd-fix-bug`, `/fd-new-feature`, or restate your task to the orchestrator.

## Fixed Pipeline

The pipeline is mandatory and cannot be shortened to save tokens:

```
Research → Discuss → Plan → Execute → Verify → Evaluate (loop) → Done
```

| Phase | What happens |
|-------|--------------|
| **0. Research** | Mandatory. Runs `repo-memory`, `load-rules`, `codebase-state`, `codebase-index` freshness check, `codegraph`, and (when available) `websearch` / `context7`. Findings persisted to `.planning/ultrawork/RESEARCH.md`. |
| **1. Discuss (done criteria)** | `@supervisor` asks via the `question` tool: what does "done" look like, max fix iterations, and any constraints research missed. `STATE.md` is initialized. |
| **2. Plan** | Routes to `@architect` or `@planner`, then `@risk-analyst` for sign-off. Plan written to `.planning/ultrawork/PLAN.md`. |
| **3. Execute** | Specialists implement the plan, each reading `RESEARCH.md` first to avoid re-researching. Iteration count and completed steps recorded in `.planning/ultrawork/ITERATIONS.md`. |
| **4. Verify** | Full `/fd-verify` pipeline — `@tester`, `@reviewer`, `@security-auditor`, deploy check. |
| **5. Evaluate** | Done criteria compared to verification result. If unmet and iterations remain, loop to Phase 3 after a human decision (`continue`, `adjust`, `abort`). If iterations exhausted, escalate. |
| **6. Done** | `.planning/ultrawork/REPORT.md` written. Lessons captured via `capture-lesson`. Suggested next step: `/fd-done`. |

Only `@supervisor` interacts with the human via the `question` tool. Other agents must not prompt directly.

## Persistence and Resume

All state is written under `.planning/ultrawork/`:

- `RESEARCH.md` — findings, risks, constraints from Phase 0
- `STATE.md` — task, done criteria, iteration count, status
- `PLAN.md` — wave-structured execution plan
- `ITERATIONS.md` — per-iteration step log and verification results
- `REPORT.md` — final summary, suggested next step

Use `/fd-resume` to continue an interrupted run. `/fd-ultrawork` reads `STATE.md` on entry and resumes from the saved status.

## Output / State

Final result is `COMPLETED`, `ACCEPTED BY HUMAN`, or `ABORTED` and is recorded in `REPORT.md` and `STATE.md`. `REPORT.md` is printed to chat at the end of the run.

## Example

```
/fd-ultrawork "Design and implement row-level security for the multi-tenant API"
```

The run will:

1. Research existing RLS patterns, tenant isolation CVEs, and the current data access layer.
2. Ask the human what "done" means (e.g., "no cross-tenant leaks in test suite, all routes 403 on unauthorized tenant").
3. Plan, route through risk-analyst, then execute in waves.
4. Run full verification after each iteration.
5. Loop or escalate until criteria are met or the iteration budget is exhausted.
6. Print a `REPORT.md` summary and suggest `/fd-done`.

## Related Commands

- The orchestrator — automatically classifies and routes routine tasks
- `/fd-resume` — continue an interrupted `/fd-ultrawork` run
- `/fd-verify` — full verification pipeline (invoked inside Phase 4)
- `/fd-done` — finalize after an `ultrawork` run completes
