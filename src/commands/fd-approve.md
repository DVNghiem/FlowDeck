---
description: Manage approval requests — list pending approvals, approve or reject a request by ID
argument-hint: [list | approve <id> | reject <id> [reason]]
---

# Approve

Manage approval requests for guarded changes.

**Input:** $ARGUMENTS

## Behavior

### List Pending (`list` or no arguments)

Read `.planning/approvals.json`. Display all pending approval requests:

```
════════════════════════════════════════
PENDING APPROVALS
════════════════════════════════════════
ID       | Change                    | Risk  | Requested
---------|---------------------------|-------|----------
APR-001  | Edit auth middleware       | HIGH  | <time>
APR-002  | Update DB migration       | MED   | <time>
════════════════════════════════════════
Use: /fd-approve approve <ID>  or  /fd-approve reject <ID> [reason]
```

If no pending approvals: "No pending approvals."

### Approve (`approve <ID>`)

1. Read `.planning/approvals.json`
2. Find approval with matching ID
3. Update status to `approved`, set `approved_at` timestamp
4. Write updated file
5. Report: "APR-XXX approved. Change may proceed."

### Reject (`reject <ID> [reason]`)

1. Find approval with matching ID
2. Update status to `rejected`, set `rejected_at` and `reason`
3. Report: "APR-XXX rejected. Reason: <reason>."

## Approval File Format

`.planning/approvals.json`:
```json
{
  "approvals": [
    {
      "id": "APR-001",
      "change": "<description>",
      "risk_score": 0.8,
      "requested_at": "<timestamp>",
      "status": "pending|approved|rejected",
      "approved_at": null,
      "rejected_at": null,
      "reason": null
    }
  ]
}
```
