# Intelligence

FlowDeck's intelligence layer evaluates every change before it is applied. It scores edit safety, tracks file change history, reproduces prior failures, predicts regressions, and enforces workflow discipline through phase gating. All intelligence services run as hooks on every tool execution — no additional commands needed.

---

## Patch Trust Score

Before any `edit` tool call is applied, the **patch trust scorer** evaluates the edit and assigns a trust score from 0.0 (dangerous) to 1.0 (safe).

The score is computed from:

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| File volatility | 25% | Historical change frequency from `.codebase/VOLATILITY.json` |
| Edit scope | 20% | Lines changed vs. file total — large rewrites score lower |
| Context window pressure | 15% | Remaining context space — edits under pressure score lower |
| Agent history | 20% | Historical failure rate of the calling agent on this file |
| Rule compliance | 20% | Does the edit violate project rules from `.flowdeck/rules/` |

**Threshold behavior:**

- Score >= 0.8 — edit applied automatically
- Score 0.5–0.8 — user notified; edit applied with confirmation prompt
- Score < 0.5 — edit blocked; user must resolve concerns or override explicitly

The `@policy-enforcer` agent is invoked automatically when the score is below threshold. The score is logged in the tool span metadata.

---

## Volatility Map

The **volatility map** tracks change frequency per file over the session and across sessions. It is maintained by the `volatility-map` tool and stored in `.codebase/VOLATILITY.json`.

```json
{
  "src/auth/login.ts": {
    "changeCount": 7,
    "lastChanged": "2026-05-26T09:30:00Z",
    "avgRevisionsPerSession": 3.2,
    "risk": "high"
  },
  "src/config/default.ts": {
    "changeCount": 1,
    "lastChanged": "2026-05-25T14:00:00Z",
    "avgRevisionsPerSession": 0.4,
    "risk": "low"
  }
}
```

Files with high volatility:

- Receive lower Patch Trust Scores automatically
- Trigger `@risk-analyst` review before large refactors
- Are flagged in the Workflow Scorecard under `context_preserved` if they change frequently within a single session

The volatility map is rebuilt on first session start and incrementally updated on each `edit` tool call.

---

## Failure Replay

When a task fails (test failure, build error, runtime crash), the **failure replay** service can reproduce the failure in isolation to generate a clean diagnostic trace.

Invoked by the `@debugger` agent via the `failure-replay` tool:

1. The tool reads the original error context from the failed span in `AGENT_SPANS.jsonl`
2. It re-runs the minimal subset of the task that caused the failure
3. The trace is written to `.codebase/FAILURE_REPLAY.jsonl`:

```json
{
  "replay_id": "fr-001",
  "original_span": "s1a2b3c",
  "task": "Run user authentication tests",
  "reproduced": true,
  "root_cause": "Missing mock for auth service in test environment",
  "trace": [
    "Step 1: npm test src/auth/login.test.ts",
    "Error: Cannot read property 'validate' of undefined",
    "Step 2: Mock auth service — result: test passes"
  ],
  "fix_suggestion": "Add mock for auth service in login.test.ts line 42"
}
```

Replays are deterministic — the same failure will reproduce the same trace. This prevents "heisenbugs" that only appear in full runs.

---

## Regression Prediction

Before a plan is executed, the **regression predictor** evaluates the planned changes against the volatility map and historical failure data to predict which tasks are likely to break tests.

The predictor runs as a pre-execution check in `/fd-execute`:

1. For each task in the plan, look up every file the task will modify in `VOLATILITY.json`
2. Cross-reference with historical failure data in `SCORECARDS.jsonl` — if similar changes broke tests before, flag the task
3. Assign a regression probability score (0.0–1.0) per task and per wave

**Output appended to PLAN.md:**

```markdown
## Regression Predictions

| Task | Files | Regression Probability | Flag |
|------|-------|----------------------|------|
| 1a: Write user model | src/models/user.ts | 0.15 | low |
| 1b: Refactor auth service | src/auth/login.ts | 0.72 | high — historically fragile |
| 2a: Integration tests | src/auth/*.test.ts | 0.31 | medium |
```

Tasks flagged `high` are presented to the user before `CONFIRM` in `/fd-plan`. The user may choose to skip, refactor, or add additional test coverage before proceeding.

---

## Phase Gating

Phase gating enforces workflow discipline by blocking entry into a phase unless the prerequisites from the previous phase are satisfied.

| Transition | Gate |
|------------|------|
| `/fd-new-feature` → `/fd-discuss` | `DISCUSS.md` must exist and have at least 3 Q&A entries |
| `/fd-discuss` → `/fd-plan` | `DISCUSS.md` must have a risk summary section |
| `/fd-plan` → `/fd-execute` | User must type `CONFIRM`; no blockers in regression predictions |
| `/fd-execute` → `/fd-verify` | All plan tasks must be marked `done` or `skipped` |

If a gate check fails, the command exits with a descriptive error listing the missing prerequisites. The user resolves them before retrying.

Phase gating is implemented by the `guard-rails` hook running in `tool.execute.before` — it intercepts command invocations and validates prerequisites before the command logic runs.

---

## Intelligence Tool Summary

| Tool / Hook | Service | Purpose |
|-------------|---------|---------|
| `patch-trust` hook | Patch Trust Score | Score edits before application |
| `volatility-map` tool + hook | Volatility Map | Track per-file change frequency |
| `failure-replay` tool | Failure Replay | Reproduce and trace prior failures |
| Regression predictor (in `/fd-plan`) | Regression Prediction | Score planned changes for breakage risk |
| `guard-rails` hook | Phase Gating | Enforce workflow discipline at phase boundaries |
| `policy-engine` tool | Rule Compliance | Evaluate edits against project rules |
| `hash-edit` tool | Edit Hashing | Content-address edits for deduplication |
