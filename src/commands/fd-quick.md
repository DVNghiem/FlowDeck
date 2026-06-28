---
description: Autonomous workflow launcher — classifies the task, selects the adaptive workflow class via scoring, and runs the minimal sufficient stage sequence end-to-end with minimal user input
argument-hint: [task description]
---

# Quick — Autonomous Workflow Launcher

Run the correct FlowDeck workflow automatically for any task. This command:
- Explores the codebase first before asking any questions
- Classifies the task type using both text signals and repo evidence
- Selects the appropriate existing workflow and stage sequence
- Routes all clarifying questions through `@supervisor` (only when evidence cannot answer)
- Executes each stage in order using the existing registered commands
- Stops only when blocked, awaiting approval, or fully verified

**Input:** $ARGUMENTS — what you need done

---

## Step 0: Autonomous Preflight Exploration

**Before asking the human anything**, explore the repository to build evidence.

Invoke `@code-explorer` to inspect the following in parallel:

1. **Repository structure** — `.planning/STATE.md`, `.planning/PROJECT.md`, `AGENTS.md`
2. **Available commands** — enumerate `src/commands/*.md` filenames
3. **Available agents** — enumerate `src/agents/*.ts` filenames
4. **Available skills** — enumerate `src/skills/` directory names
5. **Workflow config** — read `flowdeck.json` if present (governance, models)
6. **Tech stack** — read `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`
7. **Implementation patterns** — inspect `src/` top-level directories
8. **Prior decisions** — check `.planning/phases/*/DISCUSS.md` files
9. **Relevant files** — find source files matching keywords in `$ARGUMENTS`

Store the exploration snapshot in STATE.md under `quick_run.preflightExploration`:

```yaml
quick_run:
  preflightExploration:
    exploredAt: <ISO timestamp>
    techStack: [...]
    availableCommands: [...]
    availableSkills: [...]
    implementationPatterns: [...]
    evidenceCount: <N>
    clarificationResolvedByEvidence: false
    suppressedQuestions: []
```

**This step is mandatory. Do not proceed to Step 1 until exploration is complete.**

### Question suppression rule

After exploration, invoke the question guard before emitting any question:

> A question may only be forwarded to `@supervisor` if:
> 1. It cannot be answered by the exploration evidence
> 2. It has not already been asked in the current session
> 3. It is required to safely select the correct workflow

If the question can be answered from repo evidence, suppress it and log it in
`quick_run.suppressedQuestions`. Do not present it to the user.

---

## Step 1: Pre-flight State Check

1. Check `.planning/STATE.md` exists — if not, error: "No active workspace. Run `/fd-init-deep` to initialize, then `/fd-new-feature` to start a feature."
2. Read `.planning/STATE.md` to determine if a `quick_run` entry already exists for this session.
   - If `quick_run.outcome` is `running` or `blocked`: **resume from the last completed stage** (skip to Step 5).
   - If `quick_run.preflightExploration` exists and `exploredAt` is recent (< 5 min): reuse it, skip Step 0.
   - Otherwise: proceed to Step 0 then Step 2.

---

## Step 2: Classify the Task

Use **both** text-signal matching and preflight exploration evidence:

Call `classifyTaskWithContext(description, explorationResult)` from `quick-router.ts`.

This resolves ambiguous descriptions using repo evidence before flagging
`clarificationNeeded`. Most short descriptions that would normally prompt a
question are resolved by evidence (e.g., tech stack, existing patterns, prior decisions).

### Signal Classification Table

| Task Type | Strong Signal Keywords | Workflow Class | Typical Stages |
|-----------|------------------------|----------------|----------------|
| **bugfix** | fix, bug, broken, not working, error, crash, regression, debug, exception, failing, root cause, why is, stack trace | `bugfix` | `discuss → fix-bug → verify` |
| **ui-feature** | landing page, dashboard, admin panel, app screen, onboarding, wireframe, design system, ux flow, web app, website, responsive layout, navbar, modal, sidebar, frontend page | `ui-heavy` | `discuss → design → plan → execute → verify` |
| **docs** | docs, documentation, readme, api docs, usage guide, write docs, document, changelog, tutorial, docstring | `docs-only` | `write-docs → verify` |
| **simple** | rename, move file, minor, typo, update constant, update config, bump version, one-liner | `quick` | `execute → verify` |
| **feature** | (substantive description, 8+ words, no above signals) | `standard` | `plan → execute → verify` |
| **ambiguous** | (short, vague, or unclear — only after exploration cannot resolve) | `explore` | `discuss → plan → execute → verify` |

### Classification Rules

1. **Bug signals dominate**: if the description contains "fix", "bug", "error", "crash", "exception", "broken", or "regression", classify as `bugfix` even if it also mentions UI elements.
2. **UI signals for design-first**: if 1+ UI-heavy signal is present and no dominant bug signal, classify as `ui-feature`.
3. **Docs signals**: if "docs", "documentation", "readme", or "write docs" is present without implementation signals, classify as `docs`.
4. **Simple**: if "rename", "typo", "minor", or "move file" is present and description is a single, scoped operation.
5. **Feature**: substantive description (8+ words) with no specific signal type.
6. **Ambiguous** (only when exploration cannot resolve): description is too short (<5 words) or matches a bare imperative with no object (e.g., "improve", "add", "make it better") AND repo evidence does not clarify scope or type.

### Adaptive Workflow Selection

After classification, the router scores the task across multiple dimensions:
- **Simplicity** (30%): Is this a simple, focused change?
- **Confidence** (20%): How well does the description match known patterns?
- **Low Risk** (20%): Is blast radius < 3 files and no sensitive paths?
- **Known Codebase** (15%): Is the codebase mapping fresh (< 24h)?
- **Cheap Complexity** (15%): Is the task cheap (classify, validate, summarize)?

The workflow class is selected based on the total score and task type:
- Score >= 0.75 + simple/docs → `quick` workflow
- Bug signals dominate → `bugfix` workflow
- UI signals present → `ui-heavy` workflow
- Blast radius >= 5 or sensitive paths → `verify-heavy` workflow
- Confidence < 0.60 or ambiguous → `explore` workflow
- Default → `standard` workflow

The router prefers the lightest workflow that is sufficient. Escalation occurs during execution if the initial path proves insufficient.

Record the classification result:
```yaml
quick_run:
  taskDescription: "$ARGUMENTS"
  taskType: <feature|ui-feature|bugfix|docs|simple|ambiguous>
  requiresDesign: <true|false>
  requiresTDD: <true|false>
  stageSequence: [<ordered stage names>]
  completedStages: []
  currentStage: <first stage name>
  supervisorDecisions: {}
  startedAt: <ISO timestamp>
  outcome: running
```

---

## Step 3: Supervisor-Gated Clarification (only when exploration cannot resolve)

**Only proceed to Step 4 when classification confidence is sufficient.**

If classification is `ambiguous` AND exploration evidence did not resolve it:

1. Invoke `@supervisor` (preflight review of `fd-quick` command) with:
   - The partial task description
   - The preflight exploration snapshot (tech stack, patterns, prior decisions)
   - The `clarificationPrompt` from the classification (already enriched with context)
2. `@supervisor` presents the single clarifying question to the user. **Ask ONE question only.**
3. Wait for the user's answer.
4. Re-classify using the combined original description + the user's answer.
5. If confidence is still low after one clarification round, route to `feature` with a note in STATE.md.

**All clarification goes through `@supervisor`. Do not have specialist agents ask questions directly.**
**Do not ask questions that can be answered from the exploration evidence.**

Example supervisor clarification questions (only when evidence is absent):
- "Is this a new feature, a bug fix, or a documentation task?"
- "Does this involve building or changing a user-facing UI (page, dashboard, component)?"
- "Can you describe the specific bug — what is the expected vs actual behavior?"
- "Is the scope a single file change, or does it span multiple modules?"

---

## Step 4: Confirm Stage Sequence

Present the classification and planned stage sequence to the user before proceeding:

```
Task classified as: <task type>
Stage sequence:     <stage-1> → <stage-2> → ... → <stage-N>
Requires design:    <yes / no>
Requires TDD:       <yes / no>
Evidence used:      <N> items from preflight exploration

Running /fd-quick autonomously. I will proceed through each stage and pause only
if I need approval, encounter a blocker, or complete the full sequence.
```

Proceed automatically — do not wait for additional input unless approval is explicitly required by a stage.

---

## Step 5: Execute Stage Sequence Autonomously

For **each stage** in the sequence (in order), execute the following loop:

### 5a. Announce Stage Start

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stage: <stage-name>  Command: /<command>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5b. Supervisor Preflight Review

Before executing the stage, invoke `@supervisor` (preflight) on the stage's command:
- Pass: `taskDescription`, `currentPhase` (= current stage name), `prerequisitesMet`, `designApprovalPresent`, `regressionTestPresent` as known from STATE.md.

**Handle supervisor decision:**

| Decision | Action |
|----------|--------|
| `approve` | Proceed to 5c immediately |
| `revise` | Resolve the listed `requiredChanges` (e.g., confirm PLAN.md, run preceding step) then re-run the stage |
| `block` | Stop. Report why. Show what is blocked. Ask user for the specific missing input or approval. Update `quick_run.outcome = blocked` in STATE.md. |
| `escalate` | Pause. Present the escalation reason to the user. Request explicit approval. On approval: continue. On denial: stop and summarize. |

### 5c. Execute the Stage

Execute the stage using its existing command with full context from the preflight
exploration snapshot (available in `quick_run.preflightExploration`). Pass it to
each stage so worker agents can use evidence directly.

**Stage → Command Mapping:**

| Stage | Command | Key Behavior |
|-------|---------|--------------|
| `discuss` | `/fd-discuss` | Runs `@discusser` structured Q&A. Passes preflight exploration so questions already answered by evidence are skipped. Saves `DISCUSS.md`. One question at a time. |
| `design` | `/fd-design --mode=draft` | Runs design-first pipeline. Required for `ui-feature` tasks. Produces design artifact + approval. |
| `plan` | `/fd-plan` | Creates `PLAN.md` from `DISCUSS.md` decisions. **Pauses for user CONFIRM before saving.** |
| `execute` | `/fd-execute` | TDD pipeline: BEHAVIOR → RED → GREEN → REFACTOR per step. Delegates to appropriate coder agents. |
| `fix-bug` | `/fd-fix-bug` | TDD bugfix: explore → RED regression test → GREEN fix → REFACTOR → record in FAILURES.json. |
| `write-docs` | `/fd-write-docs` | Explore APIs → `@writer` drafts → `@reviewer` accuracy check → finalize. |
| `verify` | `/fd-verify` | Full verification: tests + code review + security scan + deploy check. Reports verdict. |
| `ultrawork` | `/fd-ultrawork` | Maximum-effort execution — deep research + perfection loop. Use when quality matters more than token cost. |

### 5d. Stage Completion Check

After the stage command completes:
1. Invoke `@supervisor` (post-stage) to confirm the stage output is valid.
2. If supervisor returns `approve` or `revise` with fixable issues: mark the stage complete.
3. If supervisor returns `block`: halt, report, update state.
4. Update STATE.md:
   ```yaml
   quick_run:
     completedStages: [<all completed stage names>]
     currentStage: <next stage name or null>
     supervisorDecisions:
       <stage-name>:
         decision: <decision>
         reasons: [...]
         timestamp: <ISO>
   ```
5. Proceed to next stage.

### 5e. Approval Gate (plan stage only)

The `plan` stage requires explicit user CONFIRM per the `/fd-plan` command's D-06 rule.
`/fd-quick` does NOT bypass this gate. Present the plan to the user and wait for CONFIRM.

---

## Step 6: Completion

When all stages complete:

1. Update STATE.md:
   ```yaml
   quick_run:
     completedStages: [<all stages>]
     currentStage: null
     outcome: complete
   ```

2. Present final summary:
   ```
   ════════════════════════════════════════════════
   /fd-quick Complete — <task type>
   ════════════════════════════════════════════════
   Task:      $ARGUMENTS
   Workflow:  <stage-1> → ... → <stage-N>
   Outcome:   ✅ COMPLETE
   Evidence:  <N> preflight items used (0 human questions asked before exploration)
   ────────────────────────────────────────────────
   Verify result: /fd-verify
   Save state:    /fd-checkpoint
   ════════════════════════════════════════════════
   ```

---

## Step 7: Block / Failure Handling

If execution cannot continue at any stage:

1. Update STATE.md: `quick_run.outcome = blocked`
2. Report:
   ```
   ════════════════════════════════════════════════
   /fd-quick Blocked
   ════════════════════════════════════════════════
   Stage reached:    <stage-name>
   Why stopped:      <clear reason>
   Blocked at:       <command name>
   What is needed:   <exact missing input or approval>
   ────────────────────────────────────────────────
   To resume:        /fd-quick $ARGUMENTS
     (will continue from <next-stage-name>)
   To fix manually:  /<blocked-command> [args]
   ════════════════════════════════════════════════
   ```

---

## Workflow Discipline (Adaptive)

The following gates apply based on the selected workflow class:

- **Design-first**: `ui-heavy` tasks MUST complete the `design` stage before `execute`. No override unless user explicitly requests it.
- **TDD**: `execute` and `fix-bug` stages enforce RED → GREEN → REFACTOR for `standard`, `explore`, `ui-heavy`, and `verify-heavy` workflows. `quick` and `docs-only` workflows run tests after changes instead.
- **Plan CONFIRM**: The `plan` stage requires explicit user CONFIRM (for workflows that include planning).
- **Regression test**: `bugfix` requires a failing regression test before implementation.
- **Verify**: All workflows end with `/fd-verify` when code files are changed. `quick` workflows may skip verify if no code was changed.

### Skipped Stages

For `quick` and `docs-only` workflows, the following stages are intentionally skipped:
- `discuss` — requirements are clear from the task description
- `plan` — the task is small enough to not need a formal plan

Skipped stages are logged in STATE.md under `skippedStages` with the reason "lightest sufficient workflow".

---

## Existing Commands Remain Independent

`/fd-quick` is a workflow launcher. The commands it invokes (`/fd-discuss`, `/fd-plan`, etc.) remain fully operational as standalone commands. Running `/fd-quick` does not lock out any other command.

---

## State Visibility

All routing and execution progress is recorded in `.planning/STATE.md` under the `quick_run` key. Use `/fd-status` to inspect current state. Use `/fd-resume` to reload context after a session break.