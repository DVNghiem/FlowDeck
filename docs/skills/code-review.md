# Code Quality Skills

These skills enforce FlowDeck's "working code only" guarantee — systematic review, test-driven discipline, and coverage enforcement that catches real problems before they reach production.

---

## code-review

Systematic review with security checklist and severity-ranked findings.

Reviews only changed code, reports only confirmed issues (80%+ confidence), and provides actionable fixes for every finding. Findings are ranked Critical then High then Medium then Pass. Security checklist runs first — SQL injection, XSS, hardcoded credentials, path traversal — before quality and performance checks.

---

## tdd-workflow

Red-green-refactor discipline with 80%+ coverage enforcement.

Tests before code. Always. The workflow: write a failing test (Red), write minimum code to pass (Green), then refactor while keeping tests green. Coverage threshold is 80% line coverage — non-negotiable. Unit tests for every function, integration tests for every API route, E2E only for critical paths.

---

## test-coverage

Coverage enforcement with pass/fail thresholds and actionable failure output.

Drives the write-test-then-implement cycle. Enforces 80% minimum line coverage. When coverage drops below threshold or a gap is found, the report identifies exact uncovered lines with file and line number so the agent knows exactly what to add.

---

## test-gap-detector

Identifies uncovered edge cases and suggests minimum viable test sets.

Runs before implementing a feature or fix. Checks whether modified files have test counterparts, scans for untested if/else/catch branches, flags integration gaps for external calls (db, fetch, email), and cross-references `.codebase/FAILURES.json` for regression risk. Output is a ranked gap list and 3-5 suggested test skeletons.

---

## refactor-guide

Safe refactoring one transformation at a time — tests must stay green throughout.

One transformation per commit. No features in refactor commits. If any test breaks, undo and try a smaller step. Applies the extract-function, extract-variable, and rename patterns. Danger signs that stop the refactor immediately: tests breaking during refactor, adding features during refactor, renaming and moving in the same commit.

---

Source: `src/skills/<name>/SKILL.md` in the project repository.
