---
description: Autonomous workflow launcher — classifies the task, selects the correct existing workflow, and runs the full stage sequence (discuss → plan → execute → verify and variants) end-to-end with minimal user input
argument-hint: [task description]
---

# Quick — Autonomous Workflow Launcher

Run the correct FlowDeck workflow automatically for any task. This command:
- Classifies the task type
- Selects the appropriate existing workflow and stage sequence
- Routes all clarifying questions through `@supervisor`
- Executes each stage in order using the existing registered commands
- Stops only when blocked, awaiting approval, or fully verified

**Input:** $ARGUMENTS — what you need done

---

## Step 1: Pre-flight State Check

1. Check `.planning/STATE.md` exists — if not, error: "Run /fd-new-project first."
2. Read `.planning/STATE.md` to determine if a `quick_run` entry already exists for this session.
   - If `quick_run.outcome` is `running` or `blocked`: **resume from the last completed stage** (skip to Step 5).
   - Otherwise: proceed to Step 2.

---

## Step 2: Classify the Task

Parse `$ARGUMENTS` using the signal table below to determine task type and required stage sequence.

### Signal Classification Table

| Task Type | Strong Signal Keywords | Stage Sequence |
|-----------|------------------------|----------------|
| **bugfix** | fix, bug, broken, not working, error, crash, regression, debug, exception, failing, root cause, why is, stack trace | `discuss → fix-bug → verify` |
| **ui-feature** | landing page, dashboard, admin panel, app screen, onboarding, wireframe, design system, ux flow, web app, website, responsive layout, navbar, modal, sidebar, frontend page | `discuss → design → plan → execute → verify` |
| **docs** | docs, documentation, readme, api docs, usage guide, write docs, document, changelog, tutorial, docstring | `discuss → write-docs → verify` |
| **simple** | rename, move file, minor, typo, update constant, update config, bump version, one-liner | `execute → verify` |
| **feature** | (substantive description, 8+ words, no above signals) | `discuss → plan → execute → verify` |
| **ambiguous** | (short, vague, or unclear input) | *(clarify first — see Step 3)* |

### Classification Rules

1. **Bug signals dominate**: if the description contains "fix", "bug", "error", "crash", "exception", "broken", or "regression", classify as `bugfix` even if it also mentions UI elements.
2. **UI signals for design-first**: if 1+ UI-heavy signal is present and no dominant bug signal, classify as `ui-feature`.
3. **Docs signals**: if "docs", "documentation", "readme", or "write docs" is present without implementation signals, classify as `docs`.
4. **Simple**: if "rename", "typo", "minor", or "move file" is present and description is a single, scoped operation.
5. **Feature**: substantive description (8+ words) with no specific signal type.
6. **Ambiguous**: description is too short (<5 words) or matches a bare imperative with no object (e.g., "improve", "add", "make it better").

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

## Step 3: Supervisor-Gated Clarification (when needed)

**Only proceed to Step 4 when classification confidence is sufficient.**

If classification is `ambiguous` OR confidence is low (description < 5 words or no clear signal):

1. Invoke `@supervisor` (preflight review of `fd-quick` command) with the partial task description.
2. Present the supervisor's single clarifying question to the user. **Ask ONE question only.**
3. Wait for the user's answer.
4. Re-classify using the combined original description + the user's answer.
5. If confidence is still low after one clarification round, route to `feature` with a note in STATE.md.

**All clarification goes through `@supervisor`. Do not have specialist agents ask questions directly.**

Example supervisor clarification questions (the supervisor selects the most relevant):
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

Execute the stage using its existing command with full context:

**Stage → Command Mapping:**

| Stage | Command | Key Behavior |
|-------|---------|--------------|
| `discuss` | `/fd-discuss` | Runs `@discusser` structured Q&A. Saves `DISCUSS.md`. One question at a time. |
| `design` | `/fd-design --mode=draft` | Runs design-first pipeline. Required for `ui-feature` tasks. Produces design artifact + approval. |
| `plan` | `/fd-plan` | Creates `PLAN.md` from `DISCUSS.md` decisions. **Pauses for user CONFIRM before saving.** |
| `execute` | `/fd-execute` | TDD pipeline: BEHAVIOR → RED → GREEN → REFACTOR per step. Delegates to appropriate coder agents. |
| `fix-bug` | `/fd-fix-bug` | TDD bugfix: explore → RED regression test → GREEN fix → REFACTOR → record in FAILURES.json. |
| `write-docs` | `/fd-write-docs` | Explore APIs → `@writer` drafts → `@reviewer` accuracy check → finalize. |
| `verify` | `/fd-verify` | Full verification: tests + code review + security scan + deploy check. Reports verdict. |

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

## Workflow Discipline (Non-Negotiable)

These gates from the existing workflow system are **never bypassed by /fd-quick**:

- **Design-first**: `ui-feature` tasks MUST complete the `design` stage (with `@design` approval and handoff) before `execute` can begin. No `--override` unless user explicitly requests it.
- **TDD**: `execute` and `fix-bug` stages enforce RED → GREEN → REFACTOR. `/fd-quick` does not skip tests.
- **Plan CONFIRM**: The `plan` stage requires explicit user CONFIRM. `/fd-quick` presents the plan and waits.
- **Regression test**: `fix-bug` requires a failing regression test before implementation (per `/fd-fix-bug`).
- **Verify**: All workflows end with `/fd-verify` to confirm all checks pass before marking complete.

---

## Existing Commands Remain Independent

`/fd-quick` is a workflow launcher. The commands it invokes (`/fd-discuss`, `/fd-plan`, etc.) remain fully operational as standalone commands. Running `/fd-quick` does not lock out any other command.

---

## State Visibility

All routing and execution progress is recorded in `.planning/STATE.md` under the `quick_run` key. Use `/fd-status` to inspect current state. Use `/fd-resume` to reload context after a session break.