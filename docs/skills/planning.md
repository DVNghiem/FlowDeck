# Planning Skills

These skills handle the "thinking before coding" phase — turning vague requests into concrete, executable plans with verifiable success criteria.

---

## plan-task

Wave-structured task breakdown for multi-file features.

Breaks complex features into phased wave-based plans. Each step maps to a file, has a verification check, and fits within a working session. Foundation-first ordering: types then data then services then routes then UI.

---

## confidence-aware-planning

Uncertainty-aware estimates that signal low confidence instead of guessing.

Adjusts planning behavior based on how certain the agent is. HIGH confidence proceeds normally. MEDIUM confidence surfaces explicit assumptions and risks. LOW confidence stops and asks clarifying questions before writing a plan.

---

## intent-translator

Converts vague requests into ranked implementation options with tradeoffs.

Takes input like "make checkout faster" and produces a ranked menu of 3-5 concrete options with file scope, effort estimates, risk ratings, and explicit tradeoffs — before any code is written. Stops and asks clarifying questions when intent is genuinely ambiguous.

---

## decision-trace

Records why the agent changed something, what evidence was used, and what assumptions were made.

Creates an append-only audit trail in `.codebase/DECISIONS.jsonl` for every non-trivial edit. Code reviewers can query decisions for any file in the diff and immediately understand the "why" without asking the author. Rationale answers "why this approach and not the obvious alternative?"

---

Source: `src/skills/<name>/SKILL.md` in the project repository.
