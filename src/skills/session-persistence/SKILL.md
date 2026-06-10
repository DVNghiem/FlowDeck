---
name: session-persistence
description: Maintain continuity across FlowDeck sessions by loading previous context, checkpointing mid-session state, and writing structured summaries at session end.
origin: FlowDeck
---

# Session Persistence

FlowDeck sessions are bounded by context windows. This skill ensures work survives across sessions without losing state, decisions, or momentum.

## When to Activate

Activate at:
- **Session start** — before any agent does work
- **Mid-session** — when context exceeds 60% of the window
- **Session end** — before closing the workspace

## Core Principles

- Load before you act. Never start work without reading the prior session summary.
- Checkpoint early and often. Ephemeral state is lost when the context window rolls over.
- Summaries are append-only. Each session adds a new entry; old entries rotate monthly.
- STATE.md owns the plan. SESSION_SUMMARY.md owns the narrative. Do not duplicate.

---

## Phase 1: Session Start

**Goal**: Bring the agent up to speed on what happened in the previous session and what remains.

### Files to Read

| File | Purpose | Max Chars | Required |
|------|---------|-----------|----------|
| `.planning/STATE.md` | Current phase, active plan, blockers, steps completed | 10,000 | Yes |
| `.planning/SESSION_SUMMARY.md` | Prior session narratives, decisions, failures, remaining work | 15,000 | Yes |
| `.planning/phases/phase-N/PLAN.md` | Active plan with tasks and success criteria | 8,000 | If referenced in STATE.md |
| `.codebase/DECISIONS.jsonl` | Recent decisions relevant to active work | 5,000 | Query last 10 entries |

### Information to Capture

1. **Phase and status** — from STATE.md
2. **Last completed step** — what was finished
3. **Next pending step** — what should happen now
4. **Blockers** — anything preventing progress
5. **Approaches that failed** — avoid repeating them
6. **Key decisions** — links to DECISIONS.jsonl entries
7. **Files modified** — what changed recently
8. **Test status** — green, failing, or unknown

### Commands to Use

```
/fd-resume          # Load STATE.md and latest SESSION_SUMMARY.md entry
/fd-status          # Show current phase, next step, and blocker summary
```

### Context Bounding Rules

- If SESSION_SUMMARY.md exceeds 15,000 chars, read only the **last 3 entries**.
- If there are more than 10 entries total, archive entries older than 30 days.
- Never load the full git history — use `git log --oneline -10` if needed.

### Startup Briefing Format

After loading, produce:

```markdown
## Session Resume

**Phase**: [N] — [name] | **Status**: [discuss | plan | execute | review]
**Plan**: [path or "none"]
**Last Step Completed**: [step number + name]
**Next Step**: [step number + name]
**Blockers**: [none | description]

**Context from Previous Session**:
- [What was attempted]
- [What worked]
- [What failed]
- [What remains]

**Key Decisions**: [links to DECISIONS.jsonl entries]
**Files Modified**: [list]
**Tests**: [passing | failing | unknown]
```

---

## Phase 2: Mid-Session Checkpoint

**Goal**: Save ephemeral state before the context window rolls over or before switching tasks.

### When to Checkpoint

- Context window is > 60% full
- Before running a long command (build, test suite, migration)
- Before switching agents or workflows
- Before pausing for research or discussion

### What to Save

| Data | Storage | Tool |
|------|---------|------|
| Current plan step | `.planning/STATE.md` | `planning-state` |
| Partial implementation notes | `.planning/SESSION_SUMMARY.md` | Append to latest entry |
| Decisions made this session | `.codebase/DECISIONS.jsonl` | `decision-trace` |
| Files modified | `git status` + `git diff --name-only` | Read from git |

### Command to Use

```
/fd-checkpoint      # Save current state to STATE.md and update SESSION_SUMMARY.md
```

### Checkpoint Content

A checkpoint is a lightweight update to the current SESSION_SUMMARY.md entry. Include:

- **Timestamp** — when the checkpoint occurred
- **Current step** — what is in progress
- **Partial results** — what is working so far
- **Open questions** — what is blocking or unclear
- **Next action** — what to do immediately after resuming

---

## Phase 3: Session End

**Goal**: Write a durable narrative summary so the next session can resume without re-discovering context.

### Files to Write

| File | Action | Max Size |
|------|--------|----------|
| `.planning/SESSION_SUMMARY.md` | Append new entry | Rotate when file exceeds 50 KB |
| `.planning/STATE.md` | Update completed steps, status | Keep under 5 KB |
| `.codebase/DECISIONS.jsonl` | Record any pending decisions | Append only |

### Information to Capture

1. **Session timestamp** — start and end time
2. **Phase and step** — what was being worked on
3. **Approaches that worked** — with evidence (test output, build success, etc.)
4. **Approaches attempted but failed** — with reason for failure
5. **What remains to do** — next steps with clear boundaries
6. **Key decisions made** — with links to DECISIONS.jsonl entries
7. **Files modified** — full list with one-line purpose
8. **Tests status** — which tests pass, which fail, which are new
9. **Blockers for next session** — anything that needs resolution

---

## SESSION_SUMMARY.md Format

Each entry is a level-2 section with a standard structure.

### Required Sections

```markdown
## Session YYYY-MM-DD HH:MM

**Phase**: [N] — [phase name]
**Plan**: [path to PLAN.md]
**Step Worked On**: [step number + name]
**Agents Involved**: [@agent-name, ...]

### What Worked

- [Approach 1] — Evidence: [test output / build success / deployed status]
- [Approach 2] — Evidence: [commit hash / PR link / log snippet]

### What Was Attempted But Failed

- [Approach] — Reason: [why it failed] — Lesson: [what to try instead]

### Remaining Work

- [ ] [Next step 1]
- [ ] [Next step 2]

### Key Decisions

- [Decision 1] — See `.codebase/DECISIONS.jsonl`:[entry-id]
- [Decision 2] — See `.codebase/DECISIONS.jsonl`:[entry-id]

### Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/...` | Added | ... |
| `src/...` | Edited | ... |

### Tests

| Test File | Status | Notes |
|-----------|--------|-------|
| `tests/...` | Passing | ... |
| `tests/...` | Failing | ... |
| `tests/...` | New | ... |

### Blockers

- [none | description]
```

---

## Template: SESSION_SUMMARY.md

```markdown
# Session Summaries

> Rotate monthly. Archive entries older than 30 days to `.planning/archive/summaries-YYYY-MM.md`.

## Session 2026-06-10 14:00

**Phase**: 2 — Implementation
**Plan**: `.planning/phases/phase-2/PLAN.md`
**Step Worked On**: 2.3 — Add billing service
**Agents Involved**: [@backend-coder, @tester]

### What Worked

- Using Stripe's `SubscriptionSchedule` for phased rollouts — Evidence: `npm test tests/billing.test.ts` passes
- Mocking the Stripe API with `stripe-mock` in CI — Evidence: CI run #412 green

### What Was Attempted But Failed

- Direct webhook signature verification in the controller — Reason: secret rotation broke tests — Lesson: Move verification to a dedicated middleware with fallback secrets

### Remaining Work

- [ ] Wire webhook handler to the event bus
- [ ] Add idempotency key checks
- [ ] Update API docs

### Key Decisions

- Use `SubscriptionSchedule` over `Subscription` for enterprise plans — See `.codebase/DECISIONS.jsonl`:billing-schedule-2026-06-10

### Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/services/billing.ts` | Added | Core billing logic |
| `src/middleware/webhook-verify.ts` | Added | Stripe signature verification |
| `tests/billing.test.ts` | Added | Unit tests for billing service |

### Tests

| Test File | Status | Notes |
|-----------|--------|-------|
| `tests/billing.test.ts` | Passing | 12/12 tests green |
| `tests/webhook.test.ts` | Failing | 2/5 fail — signature mismatch in test fixtures |

### Blockers

- Need Stripe test secret key to fix webhook fixtures. Ask DevOps.
```

---

## Anti-Patterns

### Do Not Load Old Context Into New Unrelated Work

If a new feature or bug fix is unrelated to the previous session's work, skip loading the full SESSION_SUMMARY.md. Read STATE.md only to confirm the current phase, then start fresh. Loading stale context pollutes the agent's reasoning with irrelevant constraints.

**Signal to skip**: The new task's files do not overlap with the prior session's `Files Modified` list.

### Do Not Let SESSION_SUMMARY.md Grow Unbounded

When the file exceeds 50 KB:
1. Create `.planning/archive/summaries-YYYY-MM.md`
2. Move all entries older than 30 days into the archive
3. Keep only the last 30 days in the active file

**Why**: Large summaries slow down session startup and waste context window space.

### Do Not Duplicate Information Already in STATE.md

SESSION_SUMMARY.md is narrative. STATE.md is structural.

| Belongs in STATE.md | Belongs in SESSION_SUMMARY.md |
|---------------------|-------------------------------|
| Phase number, plan path | What was attempted and why |
| Completed step list | Which approaches worked or failed |
| Blocker IDs | Detailed blocker context and mitigation |
| Next step reference | What remains to do with boundaries |

If STATE.md says "Step 2.3 complete", SESSION_SUMMARY.md should say "Step 2.3 complete — used SubscriptionSchedule approach, tests green".

---

## FlowDeck Commands Reference

| Command | Phase | Purpose |
|---------|-------|---------|
| `/fd-resume` | Start | Load STATE.md and latest SESSION_SUMMARY.md entry |
| `/fd-checkpoint` | Mid | Save current state before context rolls over |
| `/fd-status` | Any | Show phase, next step, blockers, and test status |

---

## Related Skills

- **[context-load](context-load/SKILL.md)** — Loads the structural context (STATE.md, PLAN.md, PROJECT.md). Use at session start before reading SESSION_SUMMARY.md.
- **[plan-task](plan-task/SKILL.md)** — Breaks work into waves with verifiable steps. Use when the remaining work in SESSION_SUMMARY.md needs re-planning.
- **[decision-trace](decision-trace/SKILL.md)** — Records the why behind changes. Link to DECISIONS.jsonl entries from SESSION_SUMMARY.md.
- **[failure-replay-engine](failure-replay-engine/SKILL.md)** — Tracks failures to avoid repeating them. Check before attempting an approach that failed in a prior session.

---

## Guidance

- **One summary per session**. If a session spans multiple days, append a sub-section with the new date rather than creating a new top-level entry.
- **Evidence over claims**. "Tests pass" is weak. "`npm test` exits 0, 14/14 tests in `billing.test.ts` green" is strong.
- **Link, don't repeat**. Reference DECISIONS.jsonl entries by ID instead of copying rationale into the summary.
- **Be honest about failures**. A failed approach with a clear lesson is more valuable than a vague success.
