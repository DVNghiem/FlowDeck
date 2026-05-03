---
description: Execute feature implementation — guard check, parallel coder + researcher, reviewer, tester, STATE.md update
argument-hint: [feature description]
---

# New Feature

Implement a new feature using the full FlowDeck agent pipeline.

**Input:** $ARGUMENTS — description of the feature to implement

## Pre-flight

1. Check `.planning/STATE.md` exists — if not, error: "Run /fd-new-project first."
2. Check `plan_confirmed: true` in STATE.md — if not, error: "Confirm plan first with /fd-plan."
3. Read `.planning/phases/phase-<N>/PLAN.md` to get implementation steps.
4. Read `.codebase/ARCHITECTURE.md` if it exists — pass as context.

## Execution Pipeline

Run the following agent pipeline for feature: **$ARGUMENTS**

### Phase 1 — Analysis (parallel)
- **@researcher**: Trace how $ARGUMENTS touches existing code, find relevant files, identify API contracts at risk
- **@architect**: Identify architectural boundaries, flag integration points, check for pattern compliance

### Phase 2 — Implementation
- **@coder**: Implement the feature following PLAN.md steps, CONVENTIONS.md patterns, and TDD discipline
  - Write failing tests FIRST (RED)
  - Implement minimum code to pass (GREEN)  
  - Refactor if needed (REFACTOR)

### Phase 3 — Validation (parallel)
- **@tester**: Run test suite, verify new tests pass, check coverage
- **@reviewer**: Review implementation for quality, security, and convention compliance

### Phase 4 — State Update
- Update `.planning/STATE.md` with completed steps
- Write summary to `.planning/phases/phase-<N>/RESULT.md`

## Guard Rails

- Block if `tdd_enforced: true` and no tests were written
- Block if any CRITICAL security issues found
- Require explicit confirmation before overwriting existing public APIs

## Completion

Report: feature implemented, tests status, reviewer findings, files changed.
