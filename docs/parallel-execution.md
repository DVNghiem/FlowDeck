# Parallel Execution

FlowDeck can coordinate multiple agents working simultaneously on independent tasks. This is managed by the `@parallel-coordinator` agent using a wave-based execution model.

---

## When to Use Parallel Execution

Parallel execution pays off when:

- A feature decomposes into clearly independent tracks (research, implementation, documentation)
- The codebase has well-separated modules with distinct file ownership
- Review and security audit need to happen simultaneously (they always can)
- Estimated total work exceeds 30 minutes

## When NOT to Use It

Avoid parallel execution when:

- Total estimated work is under 30 minutes — coordination overhead outweighs the gain
- File ownership is unclear — parallel agents editing the same files produce merge conflicts
- Task B depends directly on task A's output — sequential is correct here, not parallel

---

## The WAVE TABLE

When `@parallel-coordinator` plans work, it produces a WAVE TABLE that maps each wave to its agents, and records any inter-wave dependencies:

```
╔══════════════════════════════════════════════════════════════╗
║  WAVE TABLE — [Feature Name]                                 ║
╠══════════════════════════════════════════════════════════════╣
║  Wave 1 (parallel)  │ @researcher + @code-explorer          ║
║  Wave 2 (serial)    │ @architect                             ║
║  Wave 3 (parallel)  │ @coder + @tester                      ║
║  Wave 4 (parallel)  │ @reviewer + @security-auditor         ║
╠══════════════════════════════════════════════════════════════╣
║  Dependency lock:   │ Wave 3 blocked on Wave 2 output        ║
╚══════════════════════════════════════════════════════════════╝
```

The dependency lock line explicitly documents which wave gates are in effect. `@parallel-coordinator` enforces these locks — Wave 3 will not begin until Wave 2 output is confirmed available.

---

## Standard 4-Wave Pattern

### Wave 1 — Research (always parallel)

**Agents:** `@researcher` + `@code-explorer`

These two agents run simultaneously because neither depends on the other's output.

- **`@researcher`** — gathers external context: API documentation, library docs, relevant RFCs, prior art, and best practices for the problem domain
- **`@code-explorer`** — maps the existing codebase: which patterns are in use, which modules will be affected, which conventions must be followed

Both results feed into Wave 2 as inputs. `@architect` should not begin until both are complete.

---

### Wave 2 — Design (always serial)

**Agent:** `@architect`

Wave 2 is intentionally serial. Architecture decisions are the foundation everything else builds on — running `@coder` before `@architect` is done produces code that must be thrown away.

`@architect` consumes Wave 1 outputs and produces:

- **Interface contracts** — function signatures, type definitions, API shapes
- **Data models** — schemas, entity relationships, persistence strategy
- **ADRs (Architecture Decision Records)** — the key decisions made and the alternatives rejected, with rationale

Wave 2 output is written to `.planning/phases/*/ARCH.md` and is the authoritative specification for Wave 3.

---

### Wave 3 — Execution (usually parallel)

**Agents:** `@coder` + `@tester`

`@coder` and `@tester` can run in parallel because both work from the same Wave 2 interface contracts — neither needs to see the other's actual implementation.

- **`@coder`** — implements the interfaces and data models specified by `@architect`. Works top-down from contracts, not bottom-up from intuition.
- **`@tester`** — writes tests against the same Wave 2 interface contracts. Because tests are written to the contract (not the implementation), they are valid before `@coder` finishes.

When Wave 3 completes, tests should be passing against the new implementation. If they are not, `@coder` and `@tester` reconcile before Wave 4 begins.

> **Note:** Wave 3 is marked "usually parallel" because some features have sequential implementation requirements — for example, a migration that must run before the new code can be tested. `@parallel-coordinator` identifies these cases from the Wave 2 output and adjusts accordingly.

---

### Wave 4 — Verification (always parallel)

**Agents:** `@reviewer` + `@security-auditor`

Both agents review the same codebase snapshot but look for different issues — they can always run in parallel.

- **`@reviewer`** — checks code quality, logic correctness, error handling completeness, naming, and adherence to the project's coding standards
- **`@security-auditor`** — runs through the OWASP checklist, checks authentication and authorization logic, scans for injection vulnerabilities, and verifies that no secrets are present in the diff

Wave 4 produces a joint findings report. Findings are classified as:

| Severity | Meaning |
|----------|---------|
| **Critical** | Must be resolved before the code is merged |
| **Major** | Should be resolved; skipping requires explicit justification |
| **Minor** | Suggestions; no blocking requirement |

If Critical findings exist, the flow returns to Wave 3 (`@coder`) for remediation before re-entering Wave 4.

---

## Triggering Parallel Execution

### Automatic (via `/fd-new-feature`)

```
/fd-new-feature "payment integration with Stripe"
```

The `@orchestrator` estimates scope for every `/fd-new-feature` call. If the feature exceeds approximately 30 minutes of estimated work, `@orchestrator` automatically hands off to `@parallel-coordinator`, which builds the WAVE TABLE and begins Wave 1.

You do not need to specify parallel execution — it is selected based on scope.

### Manual (direct invocation)

For work that does not go through `/fd-new-feature`, invoke `@parallel-coordinator` directly:

```
@parallel-coordinator I need to implement the notification system.
Track 1: email notifications via SendGrid
Track 2: push notifications via Firebase FCM
Track 3: SMS notifications via Twilio
```

`@parallel-coordinator` will:
1. Identify which tracks are fully independent
2. Build a WAVE TABLE appropriate for the work
3. Manage agent dispatch, output collection, and inter-wave handoffs

---

## Merge Protocol

After parallel waves complete, `@parallel-coordinator` classifies the combined output by conflict type:

- **Additive** — each agent touched different files and different modules. These are merged automatically with no manual review required.
- **Structural** — agents touched the same module but made compatible changes (e.g., both added new functions to the same file). `@parallel-coordinator` merges and flags the overlapping area for `@reviewer`.
- **Contradictory** — agents produced conflicting design decisions (e.g., `@coder` implemented a REST interface while `@tester` assumed a message queue). These are escalated to `@architect` for resolution before any merge occurs.

The merge classification is written to `.planning/phases/*/MERGE.md` so the resolution is traceable.

---

## Using the `run-parallel` Tool

The `run-parallel` plugin tool is available in all FlowDeck sessions. It provides lower-level control over parallel dispatch when you want to coordinate agents yourself without going through `@parallel-coordinator`:

```
Use the run-parallel tool to execute @researcher and @code-explorer simultaneously
on the topic of rate-limiting strategies for REST APIs.
```

```
Use the run-parallel tool to run @reviewer on src/payments/ and 
@security-auditor on src/payments/ at the same time, then combine their findings.
```

`run-parallel` is best used when:
- You have exactly two independent tasks and do not need full WAVE TABLE management
- You want to parallelize review and audit on a specific directory after manual edits
- You are running a one-off investigation, not a full feature pipeline

For full feature work, prefer `/fd-new-feature` or direct `@parallel-coordinator` invocation over the `run-parallel` tool.

---

## Using the `delegate` Tool

The `delegate` tool runs a single agent in an isolated child session and returns its output. Use it when you need a focused sub-task completed by a specific agent without disrupting the current session context:

```
Use the delegate tool to ask @security-auditor to review src/auth/login.ts
and report back any vulnerabilities found.
```

```
Use the delegate tool with context "existing schema: ..." to ask @architect to
propose a migration plan.
```

`delegate` supports an optional `context` field — any string prepended to the agent's prompt. This is useful for passing output from a prior step without polluting the current conversation.

---

## Using the `run-pipeline` Tool

The `run-pipeline` tool chains agents sequentially: each step's output becomes part of the next step's input. This is the right tool when tasks must happen in order and each depends on the previous result:

```
Use the run-pipeline tool with steps:
  1. agent: planner, prompt: "Analyze the codebase and produce an implementation plan for the auth refactor"
  2. agent: coder, prompt: "Implement the plan"
  3. agent: reviewer, prompt: "Review the implementation for correctness and security"
```

Key behaviors:
- Each step gets its own fresh child session (no hidden state accumulates between steps)
- The previous step's text output is automatically prepended to the next step's prompt
- Set `abort_on_failure: false` to continue the pipeline even if a step fails
- Provide `initial_context` to seed the first step with prior information

---

## Implementation Notes

All three dispatch tools (`run-parallel`, `delegate`, `run-pipeline`) create real OpenCode child sessions via `client.session.create` and `client.session.prompt`. They:

- Use `parentID` to link child sessions to the current session
- Check both transport-level errors (`response.error`) and agent-level errors (`response.data.info.error`)
- Register an abort listener on the parent context so child sessions are cancelled if the parent aborts
- Return structured JSON with per-task/step results including `session_id`, `success`, and `duration_ms`

---

## Telemetry & Monitoring

The `run-parallel` tool emits structured telemetry events for observability:

| Event | When |
|-------|------|
| `agent.dispatch` | Child session created for a task |
| `agent.complete` | Task finished (success or error) |

Events are appended to `.codebase/TELEMETRY.jsonl` and include:
- `session_id` / `run_id` — session tracking
- `agent` — which agent ran
- `duration_ms` — wall time
- `status` — `ok` or `error`
- `meta` — child session ID, task index, output length, error details

Additionally, `run-parallel` writes `.codebase/parallel-progress.json` at completion with aggregate stats.

**To disable telemetry**, set the environment variable:

```bash
TELEMETRY_ENABLED=false
```

When disabled, `appendEvent()` returns `null` immediately with no file I/O. The progress file is always written regardless of this setting.

---

← [Back to Index](index.md)
