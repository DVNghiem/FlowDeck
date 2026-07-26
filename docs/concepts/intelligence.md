# Intelligence

FlowDeck's intelligence layer provides scaffolding for evaluating changes. It includes tools for risk analysis, failure replay, and rule compliance, and uses guard rails to enforce planning discipline. These services run through tools and hooks where implemented; some capabilities are planned or available only through agent prompts.

---

## Patch Trust Score

The patch trust score is a risk signal computed by `@risk-analyst` and used by the `guard-rails` hook. It is expressed as a 0–100 score:

- **80+** — generally safe; edits proceed
- **60–79** — review recommended
- **< 60** — approval required before proceeding

The score is derived from factors such as edit scope, file volatility, agent failure history, and rule compliance. The exact threshold behavior and weights are configured in agent prompts and `guard-rails.ts`, not via a standalone scoring service.

## Failure Replay

The `failure-replay` tool reproduces prior failures from stored context. It is invoked by agents (for example, `@debug-specialist`) to generate a diagnostic trace.

The tool is registered at the plugin level. It reads the original error context and re-runs the minimal subset of the task that caused the failure. Output is returned directly to the calling agent; no mandatory `.codebase/FAILURE_REPLAY.jsonl` file is written by the current implementation.

## Regression Prediction

Regression prediction is performed by `@risk-analyst` during planning and execution. It evaluates planned changes against volatility signals and historical failure data to flag high-risk tasks.

The output is a structured risk report rather than a deterministic regression probability table. Risky tasks may be surfaced in `PLAN.md` or presented to the user before execution, depending on the workflow.

## Phase Gating

Phase gating enforces workflow discipline by blocking certain tool invocations when planning prerequisites are not met. The `guard-rails` hook (`tool.execute.before`) checks `STATE.md` for:

- Whether a plan has been confirmed (`plan_confirmed`)
- Whether the task requires a design handoff (`requires_design_first`)
- Whether the workspace has been initialized (`.planning/` exists)

Specific phase transitions (for example, requiring `DISCUSS.md` before `/fd-plan`) are enforced by individual command logic, not by a universal gate table.

## Intelligence Tool Summary

| Tool / Hook | Purpose |
|-------------|---------|
| `failure-replay` | Reproduce and trace prior failures |
| `policy-engine` | Evaluate edits against project rules |
| `hash-edit` | Content-address edits for deduplication |
| `guard-rails` hook | Enforce planning discipline and execution mode |
| `@risk-analyst` | Produce patch trust and regression risk reports |

See the individual tool definitions in `src/tools/` for implementation details.
