---
name: failure-replay-engine
description: Learn from reverted commits, failed deployments, flaky tests, and bug fixes so the agent avoids repeating the same mistakes in this repo.
origin: FlowDeck
---

# Failure Replay Engine

FlowDeck remembers every failure that has been recorded in this repo. Before making a change, check the failure history for patterns that match your current task.

## Failure Types Tracked

| Type | Example |
|------|---------|
| reverted_commit | A commit that was rolled back within 48h |
| failed_deployment | A deployment that caused incidents |
| flaky_test | A test that fails intermittently |
| bug_fix | A fix for a production bug |
| build_failure | A change that broke CI |

## Workflow

### Before Making a Change

1. Query `.codebase/FAILURES.json` for failures matching the affected paths
2. If a pattern is found with `recurrence_count >= 2`, surface a warning
3. Include the failure context in your planning rationale

### After a Failure is Identified

1. Record it with the `failure-replay` tool
2. Include: type, description, affected_paths, root_cause, fix_applied, tags

### Recording a Failure

```json
{ "action": "record", "entry": {
    "id": "auth-jwt-expiry-2024-03",
    "type": "bug_fix",
    "description": "JWT tokens expired before refreshing, locking out users",
    "affected_paths": ["src/services/auth.ts", "src/middleware/validate-token.ts"],
    "root_cause": "Clock skew between services caused premature expiry",
    "fix_applied": "Added 30s clock skew buffer to expiry check",
    "tags": ["auth", "jwt", "timing"]
}}
```

## Querying Before Editing

Always query before touching auth, payment, schema, or async paths:
```json
{ "action": "query", "query": { "path_prefix": "src/services/auth", "limit": 5 } }
```

## Guidance

- Recurring failures (recurrence_count ≥ 3) indicate a systemic issue — escalate to architect
- Mark failures as resolved only after a regression test is green for 2 consecutive CI runs
- Do not delete failure records — they are the repo's institutional memory
