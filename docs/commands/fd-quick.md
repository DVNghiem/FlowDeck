# /fd-quick

**Purpose:** Focused autonomous task execution with automatic agent and workflow selection.

## Usage

/fd-quick [task description]

## What Happens

The command explores the codebase first, classifies the task, selects the appropriate workflow, and runs the full stage sequence end-to-end with minimal user input.

### Step 0: Autonomous Preflight Exploration

Before asking anything, invoke `@code-explorer` to inspect:
1. Repository structure — `.planning/STATE.md`, `.planning/PROJECT.md`, `AGENTS.md`
2. Available commands — enumerate `src/commands/*.md` filenames
3. Available agents — enumerate `src/agents/*.ts` filenames
4. Available skills — enumerate `src/skills/` directory names
5. Workflow config — read `flowdeck.json` (governance, models)
6. Tech stack — read `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`
7. Implementation patterns — inspect `src/` top-level directories
8. Prior decisions — check `.planning/phases/*/DISCUSS.md` files
9. Relevant files — find source files matching keywords in the task description

Store exploration snapshot in STATE.md under `quick_run.preflightExploration`.

### Question Suppression Rule

A question may only be forwarded to `@supervisor` if:
1. It cannot be answered by the exploration evidence
2. It has not already been asked in the current session
3. It is required to safely select the correct workflow

### Step 1: Classify the Task

Use both text-signal matching and preflight exploration evidence via `classifyTaskWithContext()`.

| Task Type | Strong Signal Keywords | Stage Sequence |
|-----------|------------------------|----------------|
| **bugfix** | fix, bug, broken, not working, error, crash, regression, debug, exception, failing, root cause | `discuss → fix-bug → verify` |
| **ui-feature** | landing page, dashboard, admin panel, app screen, wireframe, design system, ux flow | `discuss → design → plan → execute → verify` |
| **docs** | docs, documentation, readme, api docs, usage guide | `discuss → write-docs → verify` |
| **simple** | rename, move file, typo, update constant, bump version, one-liner | `execute → verify` |
| **feature** | (substantive description, 8+ words, no above signals) | `discuss → plan → execute → verify` |
| **ambiguous** | (short, vague, only after exploration cannot resolve) | *(clarify via supervisor)* |

**Bug signals dominate**: if the description contains "fix", "bug", "error", "crash", "exception", "broken", or "regression", classify as `bugfix` even if it also mentions UI elements.

### Step 2: Supervisor-Gated Clarification (only when exploration cannot resolve)

If classification is `ambiguous` AND exploration evidence did not resolve it:
1. Invoke `@supervisor` with the partial task description and preflight exploration snapshot
2. `@supervisor` asks ONE clarifying question
3. Wait for the answer
4. Re-classify using combined description + answer

### Step 3: Confirm Stage Sequence

Present the classification and planned stage sequence before proceeding:
```
Task classified as: <task type>
Stage sequence:     <stage-1> → <stage-2> → ... → <stage-N>
Requires design:    <yes / no>
Requires TDD:       <yes / no>
Evidence used:      <N> items from preflight exploration

Running /fd-quick autonomously. I will proceed through each stage and pause only
if I need approval, encounter a blocker, or complete the full sequence.
```

Proceed automatically — do not wait for additional input unless approval is explicitly required.

### Step 4: Execute Stage Sequence Autonomously

For each stage in sequence:

1. **Announce stage start**
2. **Supervisor preflight review** — pass `taskDescription`, `currentPhase`, `prerequisitesMet`, `designApprovalPresent`, `regressionTestPresent`
3. **Handle supervisor decision:**
   - `approve` — proceed immediately
   - `revise` — resolve listed required changes then re-run stage
   - `block` — stop, report why, update `quick_run.outcome = blocked`
   - `escalate` — pause, present reason to user, request explicit approval
4. **Execute the stage** using its existing command with full context
5. **Stage completion check** — invoke `@supervisor` (post-stage) to confirm valid output
6. **Update STATE.md** with completed stages and supervisor decisions
7. **Proceed to next stage**

**Stage → Command Mapping:**

| Stage | Command | Key Behavior |
|-------|---------|--------------|
| `discuss` | `/fd-discuss` | Runs `@discusser` structured Q&A. Questions already answered by evidence are skipped. Saves `DISCUSS.md`. |
| `design` | `/fd-design --mode=draft` | Runs design-first pipeline. Required for `ui-feature` tasks. Produces design artifact + approval. |
| `plan` | `/fd-plan` | Creates `PLAN.md` from `DISCUSS.md` decisions. **Pauses for user CONFIRM before saving.** |
| `execute` | `/fd-execute` | TDD pipeline: BEHAVIOR → RED → GREEN → REFACTOR per step. |
| `fix-bug` | `/fd-fix-bug` | TDD bugfix: explore → RED regression test → GREEN fix → REFACTOR → record in FAILURES.json. |
| `write-docs` | `/fd-write-docs` | Explore APIs → `@writer` drafts → `@reviewer` accuracy check → finalize. |
| `verify` | `/fd-verify` | Full verification: tests + code review + security scan + deploy check. Reports verdict. |

### Step 5: Completion

When all stages complete:
1. Update STATE.md with `outcome: complete`
2. Present final summary

### Block / Failure Handling

If execution cannot continue at any stage:
1. Update STATE.md: `quick_run.outcome = blocked`
2. Report blocked stage, reason, what's needed, and how to resume

## Workflow Discipline (Non-Negotiable)

- **Design-first**: `ui-feature` tasks MUST complete the `design` stage before `execute` can begin
- **TDD**: `execute` and `fix-bug` stages enforce RED → GREEN → REFACTOR
- **Plan CONFIRM**: The `plan` stage requires explicit user CONFIRM
- **Regression test**: `fix-bug` requires a failing regression test before implementation
- **Verify**: All workflows end with `/fd-verify`

## Output / State

All routing and execution progress recorded in `.planning/STATE.md` under `quick_run` key.

## Examples

**Run a feature through full workflow:**
```
/fd-quick "Add user profile page with avatar upload"
```

**Fix a bug autonomously:**
```
/fd-quick "Fix the login timeout error that happens randomly"
```

**Start a documentation task:**
```
/fd-quick "Generate API documentation for the payment module"
```

## Related Commands

- `/fd-discuss` — explore a topic manually
- `/fd-plan` — plan manually
- `/fd-execute` — execute manually
- `/fd-status` — inspect current state and progress
- `/fd-resume` — reload context after a session break