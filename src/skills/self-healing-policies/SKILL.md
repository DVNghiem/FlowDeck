---
name: self-healing-policies
description: Update internal editing rules automatically after repeated failures, making the plugin more reliable over time inside the same repo.
origin: FlowDeck
---

# Self-Healing Prompt Policies

FlowDeck can learn from its own mistakes. When the same type of failure recurs, a new policy is added to `.codebase/POLICIES.json` to prevent it from happening again.

## How Policies Work

A policy is a trigger → rule pair:
- **trigger**: the pattern that precedes the mistake (e.g., "editing auth middleware")
- **rule**: what the agent must do/avoid when the trigger matches (e.g., "always run auth integration tests before committing")

## Policy Lifecycle

1. **Detection**: A failure is recorded in FAILURES.json with recurrence_count ≥ 2
2. **Proposal**: The agent proposes a new policy to prevent the recurrence
3. **Review**: Human reviews and approves/rejects via `/policy-update`
4. **Active**: Policy is marked active=true and checked before relevant edits
5. **Violation tracking**: Every time a policy is nearly violated, record it
6. **Pruning**: Policies with 0 violations in 90 days are candidates for deactivation

## Policy Sources

| Source | Meaning |
|--------|---------|
| manual | Added by a human directly |
| learned | Proposed by the agent after failure pattern detected |

## Workflow

### Adding a Learned Policy

After recording a recurrent failure:
1. Check if recurrence_count ≥ 2 for any failure entry
2. If yes, propose a policy:
   ```json
   { "action": "add", "policy": {
       "id": "no-auth-edit-without-tests",
       "name": "Auth edits require test run",
       "trigger": "editing files matching src/auth/ or src/middleware/",
       "rule": "Always run auth test suite before committing. If no auth tests exist, create at least one regression test.",
       "source": "learned",
       "failure_count": 3
   }}
   ```
3. Notify the human for approval

### Checking Policies Before Edit

Before editing a file:
1. Query active policies: `{ "action": "query", "query": { "active_only": true } }`
2. Check if any policy trigger matches the current file path or change type
3. If match: apply the rule before proceeding

### Updating Policies After New Failure

```json
{ "action": "record_violation", "policy_id": "no-auth-edit-without-tests" }
```

## Manual Policy Management

```
/policy-update {"action": "add", "policy": {...}}   — add new policy
/policy-update {"action": "toggle", "policy_id": "X", "active": false}  — disable
```

## Guidance

- Policies should be specific ("when editing X, always Y") not vague ("be careful")
- Every learned policy must reference the failure ID that triggered it
- Review all policies quarterly — disable ones that have never fired
