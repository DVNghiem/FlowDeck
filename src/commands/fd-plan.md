---
description: Create detailed implementation plan — research-first, adaptive guard check (skip discuss for quick workflows), save PLAN.md, update STATE.md, require CONFIRM before execution
argument-hint: [--phase=N] [--yes]
---

# Plan

Create a detailed implementation plan from confirmed DISCUSS.md decisions.

**Input:** $ARGUMENTS (optional `--phase=N` to target a specific phase, `--yes` to skip confirmation)

## Process

### Step 0: Research Gate

**Before producing any plan**, gather implementation context from the repository.

Research scope: `plan`

**CodeGraph Intelligence Check (first):**

```
codegraph action=check
```

- If codegraph is installed and indexed: use `codegraph_context`, `codegraph_explore`, `codegraph_impact` for architecture and affected-file analysis instead of direct file reads
  - Log: "codegraph available — using code intelligence for research gate"
- If codegraph is absent or stale: fall back to standard research pass

**Standard research pass (always):**

1. Read `.planning/STATE.md` — current phase, position, freshness
2. Read `.planning/phases/phase-<N>/DISCUSS.md` — D-XX decisions to trace
3. Read `.codebase/ARCHITECTURE.md` if available — codebase structure
4. Read `.codebase/CODEBASE_INDEX.md` if available — recent changes and volatility signals
5. Read `.codebase/CODEGRAPH.md` if available — codegraph index freshness metadata
6. Check for any `research_plan` evidence in STATE.md from prior research passes

If existing research is fresh (summaryVersion matches, state fresh within 5 min):
- Reuse the persisted research evidence
- Log: "Research skipped — fresh evidence reused from prior pass"
- Proceed to Step 1

If research is stale or missing:
- Run fresh research pass using available MCP and filesystem tools
- Persist results to STATE.md for future reuse
- Log which sources were consulted and what evidence was gathered

> **MCP integration:** When library, API, or external knowledge is needed, invoke configured MCP tools as part of the research pass.
> - **context7** — library docs lookup (first choice for API/docs questions)
> - **sequential-thinking** — stepwise planning for complex or ambiguous tasks
> - **memory** — retrieve prior context when available
> - **magic** — UI/design system research
> - **playwright** — verify browser behavior for frontend tasks
> - **token-optimizer** — compress large research context before planning

### Step 1: Guard Check

D-06: Verify prerequisites for planning.

Read STATE.md to check `workflowClass`:

**For `quick` / `docs-only` workflows:**
- DISCUSS.md is NOT required.
- Proceed directly to Step 2.
- Log: "Quick workflow — skipping DISCUSS.md guard"

**For all other workflows:**
- Verify DISCUSS.md exists and is confirmed.

If no DISCUSS.md found (and not quick/docs-only):
```
Error: DISCUSS.md not found. Run /fd-discuss [topic] first.
```

If DISCUSS.md exists but not confirmed (and not quick/docs-only):
```
Error: DISCUSS.md not yet confirmed. Complete the discuss phase first.
```

Abort with clear error message in both cases.

### Step 2: Load Context

Read:
- `.codebase/PROJECT.md` (project context)
- `.planning/STATE.md` (current phase and position)
- `.planning/phases/phase-<N>/DISCUSS.md` (D-XX decisions to trace in plan)

### Step 3: Draft Plan

Create PLAN.md with:
- Tasks that trace to D-XX decisions from DISCUSS.md
- Each task includes `<action>` referencing relevant D-XX decisions
- Wave assignments for parallel execution
- File dependencies between tasks

### Step 4: Validate Plan

Verify:
- All requirements from ROADMAP.md for current phase are addressed
- All D-XX decisions from DISCUSS.md are traced in plan tasks
- No tasks that contradict prior decisions

If validation fails, return to Step 3 to revise.

### Step 5: Review Plan

Present draft plan to user:
- Show all tasks and their D-XX decision traces
- Show wave structure
- Show file dependencies

### Step 6: PAUSE CONFIRM

D-06: "PAUSE — wait for user CONFIRM before saving"

Present:
```
Ready to save PLAN.md?
Type CONFIRM to save, or describe changes needed.
```

If user types CONFIRM, proceed to Step 7.
If user requests changes, return to Step 3 with feedback.

### Step 7: Save Plan

Save PLAN.md to `.planning/phases/phase-<N>/PLAN.md`.
Commit with message: `docs(phase-N): save confirmed plan`

### Step 8: Update State

Call `planning-state` tool with `action: update`:
  - plan_file: <path returned by write_plan>
  - plan_confirmed: true
  - last_action: "Plan confirmed"
  - next_action: "run /fd-execute"
  - If task is UI-heavy: also set requires_design_first: true, design_stage: pending

Do NOT write STATE.md directly. Always use planning-state action:update.

## D-06 Compliance

- Requires confirmed DISCUSS.md before proceeding
- Aborts with clear error if DISCUSS.md not confirmed
- Creates PLAN.md tracing D-XX decisions
- Pauses for user CONFIRM before saving

## Error Handling

D-03: Fail fast with clear error
- If guard check fails: abort with clear error and remediation
- If plan validation fails: show what's missing
- No partial plan saved on error

## Completion

Report: plan saved, decisions count, file path, next step: run `/fd-execute` or `/fd-fix-bug`.
