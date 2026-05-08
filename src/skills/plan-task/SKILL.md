---
name: plan-task
description: Break complex features into a phased implementation plan with wave-structured parallel tasks, dependency graph, and verifiable success criteria. Use before starting any multi-file feature.
origin: FlowDeck
---

# Plan Task Skill

Turns vague feature requests into concrete, executable plans. Each step maps to a file, has a verification, and fits within a working session.

## When to Activate

Activate when:
- A feature touches more than 2 files
- You are unsure what order to implement things
- Multiple people need to work on the feature in parallel
- The feature involves data model changes or API changes

## Core Principles

- Foundation first: types → data → services → routes → UI
- Steps must be independently verifiable
- No step longer than 2-3 hours of work
- Success criteria must be observable (not "it works")

## Task Sizing Guide

| Size | Duration | Action |
|------|----------|--------|
| Too small | < 30 min | Combine with a related task |
| Right size | 1-3 hours | Keep as is |
| Too large | > 3 hours | Split into two steps in separate waves |

## Workflow

1. **Parse requirements** — list every behavior the feature must have
2. **Map to files** — which files must change for each behavior?
3. **Build dependency graph** — which changes depend on others?
4. **Group into waves** — independent changes in same wave
5. **Write success criteria** — one observable outcome per requirement

## Wave Assignment Rules

**Same wave (run in parallel):**
- Different files, no shared mutable state
- Neither task reads the other's output

**Next wave:**
- Integration tasks (wiring together Wave 1 outputs)
- Review and documentation
- Any task that reads output produced by Wave 1

## Plan Format

```markdown
# Plan: [Feature Name]

## Objective
[What this delivers and why]

## Wave 1 — Foundation (parallel)

### Task 1.A — [Name]
- **Agent**: @backend-coder
- **File**: `src/models/subscription.ts`
- **Scope**: Create Subscription model with id, userId, status, expiresAt
- **Verify**: `npx tsc --noEmit` passes

### Task 1.B — [Name]
- **Agent**: @researcher
- **Scope**: Document Stripe subscription API
- **Verify**: Research covers: create, cancel, webhook events

## Wave 2 — Implementation (after Wave 1)

### Task 2.A — [Name]
- **Agent**: @backend-coder
- **Depends on**: Task 1.A, Task 1.B
- **File**: `src/services/billing-service.ts`
- **Scope**: Implement subscribe(), cancel(), handleWebhook()
- **Verify**: `npm test src/billing.test.ts` passes

## Success Criteria
- [ ] [Observable outcome 1]
- [ ] [Observable outcome 2]
- [ ] `npm test` exits 0
- [ ] `npx tsc --noEmit` exits 0
```

## Success Criteria Quality

```
✅ Good: "User can log in with email+password and receives a JWT"
❌ Bad: "Authentication works"

✅ Good: "GET /users/:id returns 404 when user does not exist"
❌ Bad: "Error handling works"

✅ Good: "npm test produces 0 failures"
❌ Bad: "Tests pass"
```
