---
name: patch-trust-score
description: Assign a confidence and risk rating to every AI-generated change. Returns safe, review-required, or high-risk verdict with specific signals.
origin: FlowDeck
---

# Patch Trust Score

Every AI-generated patch gets a trust score before it is applied. The score gates how the change is handled: auto-apply, flag for review, or block and escalate.

## Score Bands

| Score | Verdict | Action |
|-------|---------|--------|
| 80–100 | safe | Auto-apply in guarded mode |
| 40–79 | review-required | Inline warning + human ACK |
| 0–39 | high-risk | Block auto-apply, route to reviewer |

## Risk Signals (each reduces the score)

| Signal | Deduction |
|--------|-----------|
| File in volatile/critical volatility zone | −25 to −40 |
| File has prior failure history | −20 |
| Edit contains auth/crypto/payment keywords | −8 per keyword (max −30) |
| File in arch-constrained zone | −20 |
| No test coverage for file | −10 |

## Workflow

1. For every proposed write or edit:
   a. Look up the file in `.codebase/VOLATILITY.json`
   b. Check `.codebase/FAILURES.json` for prior failures on this file
   c. Scan the patch content for high-risk keywords
   d. Check `.codebase/CONSTRAINTS.md` for boundary violations
2. Compute score (0–100, start at 100)
3. Emit verdict with signals
4. Route accordingly (auto / warn / block)

## Integration

The `patch-trust` hook runs automatically on every `write` and `edit` tool call. The score is logged to stdout and appended to `.codebase/DECISIONS.jsonl`.

For manual scoring, use the `patch-trust-score` skill with a file path and change description.
