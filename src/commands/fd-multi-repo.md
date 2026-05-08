---
description: Cross-repo change orchestration — analyze-repos → identify-dependencies → plan-changes → execute-per-repo → verify-integration
argument-hint: [list | add <path> [name] | remove <name> | status]
---

# Multi-Repo

Orchestrates a feature or fix that spans multiple repositories in a microservice architecture.

**Input:** $ARGUMENTS

## When to Use

- A feature requires changes in two or more services
- An API contract is changing in an upstream service with downstream consumers
- A shared library is being upgraded with a breaking change
- You need a coordinated rollout across services

Do not use for single-repo work. Use `/new-feature` instead.

## Prerequisites

Before running this flow:
1. `.planning/config.json` has a `sub_repos` array with the relevant repos registered
2. All `path` values in the registry resolve to actual directories on disk
3. A description of the intended change is available (from `/discuss` or passed directly)

If the registry is empty or not set up, run `/multi-repo --add` first.

## Behavior

### List (`list` or no arguments)

Read `.planning/config.json` → `repos` array. Display:

```
════════════════════════════════════
MULTI-REPO REGISTRY
════════════════════════════════════
  user-service     ../user-service     upstream-api         node+typescript
  order-service    ../order-service    downstream-consumer  node+typescript
  shared-types     ../shared-types     shared-lib           node+typescript
  api-gateway      ../api-gateway      gateway              nginx+lua

Path check: all 4 repos resolved ✅
```

### Add (`add <path> [name]`)

1. Verify `<path>` exists and has a `.planning/STATE.md`
2. Derive `name` from directory basename if not provided
3. Add to `.planning/config.json` → `repos` array
4. Report: "Added '<name>' at <path>."

### Remove (`remove <name>`)

Remove matching repo from registry. Report: "Removed '<name>'."

### Status (`status`)

For each registered repo, read its STATE.md and display:

```
════════════════════════════════════
WORKSPACE STATUS
════════════════════════════════════
  frontend  — Phase 2 | in_progress | Updated: <time>
  backend   — Phase 3 | completed   | Updated: <time>
  shared    — Phase 1 | planned     | Updated: <time>
════════════════════════════════════
Overall: 1 in progress, 1 complete, 1 planned
```

## Execution Flow

### Step 1: Analyze Repos

`@multi-repo-coordinator` reads `.planning/config.json` and produces a registry summary.

If any path fails to resolve, the flow stops here with a clear error. The registry must be clean before proceeding.

### Step 2: Identify Dependencies

`@multi-repo-coordinator` and `@architect` work together to:

1. Build the dependency graph from service roles and actual API references (scan client code, package.json, service mesh config)
2. Classify the requested change as breaking or non-breaking for each affected service
3. Produce the ordered change list

If any circular dependency is detected, the flow stops and reports the cycle. Circular dependencies cannot be resolved automatically.

### Step 3: Plan Changes

`@architect` produces the cross-repo CHANGE PLAN using contract-first development:

1. Write the new API contract or type definition before any implementation starts
2. Confirm the contract covers all required changes without unnecessary scope creep
3. Produce a per-repo task list ordered by the dependency graph

### Step 4: Execute Per Repo

Changes execute in dependency order. For each repo:

1. Implementation agent (`@backend-coder`, `@frontend-coder`, or `@devops`) implements the changes in that repo based on scope
2. `@tester` writes and runs tests for that repo's changes
3. No downstream repo starts until the upstream repo's changes pass tests

For non-breaking changes, implementation agent and `@tester` for a given repo run in parallel. For breaking changes, `@tester` must verify the upstream before downstream implementation starts.

If a repo's implementation agent or `@tester` fails, that repo and all downstream repos in the dependency chain are paused. Upstream repos that completed are not rolled back — they remain deployed. The flow resumes once the failing repo is fixed.

### Step 5: Verify Integration

After all per-repo changes are complete, `@tester` and `@reviewer` run cross-repo verification:

**@tester (integration):**
```
Task: Run end-to-end integration tests covering the full change path
Scope: user-service → order-service interaction via the new preferences endpoint
Test environment: staging (all services deployed to stage)
```

**@reviewer (cross-repo review):**
```
Task: Review all changed files across all repos
Check: contract adherence, no breaking changes introduced unintentionally,
       consistent error handling patterns across services
```

Both run in parallel. Integration tests failing in stage block the production rollout for the entire change set.

## Rollout After Integration Pass

Once integration is verified in staging, deploy in dependency order:

```
1. shared-types  →  publish to package registry (semver minor)
2. user-service  →  canary (5% traffic, 15 min) → stage ✅ → prod
3. order-service →  canary (after user-service prod) → stage ✅ → prod
4. api-gateway   →  canary (after order-service prod) → stage ✅ → prod
```

No downstream service enters its canary phase until the upstream service is confirmed stable in production.

## Conflict Handling

If `@multi-repo-coordinator` detects a conflict during Step 2 or Step 3 (two concurrent changes that are incompatible), the flow pauses:

```
FLOW PAUSED — Conflict Requires Resolution

  Service A (user-service): removing `legacyUserId` from response
  Service B (order-service PR #47): new consumer of `legacyUserId`
  Classification: Breaking API collision

  Resolution options:
    A. Versioned endpoint: keep /v1/users (with legacyUserId) + add /v2/users (without)
    B. Coordinate: block order-service PR #47 until user-service migration is complete
    C. Reverse: defer the user-service removal until order-service removes its dependency

  Owner teams: platform (user-service), commerce (order-service)
  Decision required before this flow can continue.
```

The flow does not auto-resolve conflicts. It surfaces them clearly, names the options, and waits for human direction.

## Error Handling

| Condition | Action |
|-----------|--------|
| Registry path not found on disk | Stop at Step 1; report which path failed |
| Circular dependency in graph | Stop at Step 2; show the cycle |
| Contract review rejected | Stop at Step 3; rework contract before proceeding |
| Repo's tests fail | Pause that repo and all dependents; upstream remains deployed |
| Integration test fails | Block production rollout; report which test failed and why |
| Conflict detected | Pause flow; surface options; wait for human decision |

## Config Format

`.planning/config.json` repos entry:
```json
{
  "repos": [
    { "name": "frontend", "path": "./packages/frontend" }
  ]
}
```
