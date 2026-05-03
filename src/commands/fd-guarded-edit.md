---
description: Edit gate — decides auto-approve / require-confirmation / require-review / block based on policy, trust score, volatility, and arch constraints
argument-hint: [change description or file path]
---

# Guarded Edit

Evaluate a proposed edit against all safety gates before allowing it to proceed.

**Input:** $ARGUMENTS — description or file path of the proposed edit

## Gates (evaluated in order)

### Gate 1 — Policy Check

Read `.planning/config.json` for active policies:
- `approval_required`: if true, all edits need explicit approval
- `volatility_threshold`: edits touching files above this score need confirmation

### Gate 2 — Volatility Check

Check `.codebase/VOLATILITY.json` for the files in `$ARGUMENTS`.
- Score ≥ 0.8 → REQUIRE REVIEW
- Score ≥ 0.6 → REQUIRE CONFIRMATION
- Score < 0.6 → proceed

### Gate 3 — Architecture Constraints

Read `.codebase/ARCHITECTURE.md` and check if the edit:
- Crosses defined service boundaries
- Modifies public API contracts
- Touches security-critical paths (auth, payments, PII)

### Gate 4 — Trust Score

Check `.codebase/FAILURES.json` for prior failures in the same path.
- 3+ prior failures in this area → REQUIRE REVIEW
- 1-2 prior failures → REQUIRE CONFIRMATION

## Decision Matrix

| Condition | Decision |
|-----------|----------|
| Any BLOCK signal | ❌ BLOCK |
| REQUIRE REVIEW signal | 👁️ REQUIRE REVIEW |
| REQUIRE CONFIRMATION signal | ⚠️ REQUIRE CONFIRMATION |
| All gates pass | ✅ AUTO-APPROVE |

## Report

```
════════════════════════════════════
GUARDED EDIT GATE
════════════════════════════════════
Edit: <summary>

Gate 1 — Policy:      <pass|flag>
Gate 2 — Volatility:  <score> → <pass|confirm|review>
Gate 3 — Arch:        <pass|flag>
Gate 4 — Trust:       <failures count> → <pass|confirm|review>

DECISION: AUTO-APPROVE / CONFIRM / REVIEW / BLOCK

<if BLOCK or REVIEW: explain what needs to happen first>
════════════════════════════════════
```

If BLOCK: do not proceed with the edit. Explain what must change first.
If CONFIRM: present to user and wait for explicit "yes" before proceeding.
