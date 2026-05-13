---
name: human-review-routing
description: Route risky patches to the right reviewer type — security, backend, infra, or domain owner — based on the nature of the change and its patch trust score.
origin: FlowDeck
---

# Human Review Routing

When a patch is flagged as `review-required` or `high-risk` by the Patch Trust Score, it must be routed to the right human reviewer. This skill defines the routing logic.

## Reviewer Types and Triggers

| Reviewer | Triggered by |
|----------|-------------|
| security | auth, token, password, crypto, secret, jwt, permission, rbac, xss, sql |
| backend | api, route, controller, service, database, query, migration |
| infra | docker, kubernetes, terraform, ci, cd, deploy, helm, nginx, aws, gcp |
| domain-owner | business, billing, payment, checkout, order, subscription, pricing |
| frontend | component, css, html, react, vue, ui, ux, style |
| data | schema, migration, model, index, constraint, foreign key |
| devops | pipeline, workflow, .yml, .yaml, action, cron, schedule |

## Routing Logic

1. Scan the changed file paths and change description for keywords from the table above
2. Check the Patch Trust Score verdict
3. **High-risk** always adds `security` to the reviewer list
4. Multiple reviewer types can be assigned to one patch
5. If no keywords match and verdict is `safe`, route to `general-reviewer`

## Workflow

Provide the files and change description to the agent to get the routing decision.

Example input:
```
Review route for: files=src/services/auth.ts,src/api/payment.ts change=refactor JWT validation
```
Output:
```
Route to: security, backend, domain-owner
Trust verdict: review-required
```

## Review Request Format

When routing a patch, include:
```markdown
## Review Request

**Patch**: [brief description]
**Files**: [list]
**Trust Score**: [score] ([verdict])
**Route to**: [reviewer types]
**Reason**: [why this routing]
**Deadline**: [if blocking release]

### Key areas to check
- [specific concern 1]
- [specific concern 2]
```

## Escalation

If no appropriate reviewer is available within 24h, escalate to the tech lead. Never merge a `high-risk` patch without at least one human approval.
