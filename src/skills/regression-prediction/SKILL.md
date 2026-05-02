---
name: regression-prediction
description: Estimate the most likely regression categories for a proposed change — performance, auth, schema, UI states, async flows — before merging.
origin: FlowDeck
---

# Regression Prediction

Before merging, predict what is most likely to break. Run `/regression-predict` with a description of the change and the files affected.

## Regression Categories

| Category | Triggered by |
|----------|-------------|
| performance | database queries, loops, caching, serialization, lazy-loading |
| auth | JWT, session, OAuth, RBAC, middleware, token, permission |
| schema | database migration, model change, field rename, relation change |
| ui-state | React state, Redux, context, form state, loading/error states |
| async-flow | Promise, async/await, event emitter, queue, webhook, retry logic |
| api-contract | Route signature, request/response shape, HTTP status codes |
| data-integrity | Validation, constraints, null handling, type coercion |
| security | Input sanitization, XSS, CSRF, injection, file upload |
| config | Environment variables, feature flags, hardcoded values |
| i18n | Hardcoded strings, date/time formatting, locale handling |

## Prediction Workflow

1. Map the changed files to regression categories using keyword detection
2. Check `.codebase/FAILURES.json` for prior regressions in these files
3. Weight categories by: keyword match + failure history + test coverage gap
4. Rank by probability × severity
5. For each top-3 category, suggest a specific test to catch the regression

## Output Format

```markdown
## Regression Prediction Report

### Change: [description]

| Category | Probability | Severity | Evidence | Suggested Test |
|----------|------------|---------|---------|----------------|
| auth | high | critical | JWT logic modified, prior auth failure | Test token expiry boundary |
| schema | medium | high | Model field added | Test migration rollback |
| async-flow | low | medium | No async code changed | — |

### Top Risk: auth
[Specific regression scenario and suggested test]

### Prediction Confidence: [HIGH / MEDIUM / LOW]
```

## Guidance

- High probability + critical severity = do not merge without regression test
- Use predictions to prioritize what to test BEFORE merging, not after
- Record confirmed regressions in `.codebase/FAILURES.json` to improve future predictions
