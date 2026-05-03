---
description: Regression Prediction — estimate the most likely regression categories for a proposed change
argument-hint: [change description]
---

# Regression Predict

Predict the most likely regression categories for a proposed change before implementing it.

**Input:** $ARGUMENTS — description of the proposed change

## Steps

Run two agents in parallel:

- **@researcher**: Map the changed code paths in `$ARGUMENTS` to regression category keywords and patterns; check `.codebase/FAILURES.json` for prior regressions in the same area

- **@tester**: Analyze existing test coverage for the affected paths; identify which regression categories are under-tested

## Regression Categories

| Category | Indicators |
|----------|-----------|
| **Performance** | touching caching, DB queries, loops, response serialization |
| **Auth / Security** | touching middleware, tokens, sessions, permissions |
| **Schema / Data** | touching DB models, migrations, serializers |
| **UI States** | touching frontend components, state management, events |
| **Async Flows** | touching queues, workers, webhooks, timeouts |
| **API Contracts** | touching public endpoints, request/response shapes |
| **Integration** | touching external service calls, adapters |

## Report

```
════════════════════════════════════════════
REGRESSION PREDICTION
════════════════════════════════════════════
Change: <summary of $ARGUMENTS>

Likely Regressions (ranked by probability):

  🔴 HIGH — Auth/Security
     Reason: change touches middleware X
     Prior: FAILURES.json F-12 (×3 recurrences)

  🟠 MEDIUM — API Contracts  
     Reason: modifies response shape of /api/checkout

  🟡 LOW — Performance
     Reason: adds DB query in hot path

────────────────────────────────────────────
Recommended Tests to Add:
  1. <specific test scenario>
  2. <specific test scenario>
════════════════════════════════════════════
```
