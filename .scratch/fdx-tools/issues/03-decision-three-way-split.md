# 03 — Reconcile `fdx-decisions` / `capture-lesson` / `architecture.md` three-way split

Type: research
Status: open
Triage: ready-for-agent

## Context

Plan-eng-review outside voice (Finding 4, D16) found that the design introduces a third source of truth for design decisions:
- `fdx-decisions` → `~/.fd-plan/<slug>/<topic>/decisions.md`
- `capture-lesson` → `.flowdeck/lessons.md` (project-level)
- `architecture.md > Alternatives Considered` → `~/.fd-plan/<slug>/<topic>/architecture.md`

The plan's P4 acknowledged that `fdx-decisions` and `capture-lesson` will drift. The plan did NOT acknowledge `architecture.md` as a third dupe. At runtime, no orchestrator instruction says which one to use when. Future readers grepping for "decisions" will find the wrong file.

## Why

The user explicitly chose Approach A in /office-hours, accepting duplication for pattern consistency. But the cost analysis was 2-way, not 3-way. If we ship `fdx-decisions` and `architecture.md` both accumulate the same design decisions, the duplication compounds.

## Pros

- One source of truth per concern.
- No future grep-surprise for the user.

## Cons

- Requires deciding the boundary: ephemeral per-step decisions vs topic-wide architecture vs retrospective lessons.
- Either drop `fdx-decisions` (forces `architecture.md` to be the only design-decision log) or accept the 3-way split and document it.

## Where to start

1. Read `src/commands/fd-task.md` to find where `architecture.md` is written today.
2. Decide: is `fdx-decisions` for ephemeral per-step calls (like "we picked library X over Y for this subagent"), while `architecture.md` is for the topic's whole? If yes, document the boundary in the tool description.
3. Alternative: drop `fdx-decisions` and have the orchestrator embed a `## Decisions` section in `architecture.md`. Saves one tool but loses the per-step timestamp granularity.

## Depends on / blocked by

- The 4 tools PR must land first (to give us a `fdx-decisions` to study in production).
