# /fd-multi-repo

**Purpose:** Multi-repo orchestration for coordinated changes across a microservice architecture.

## Usage

/fd-multi-repo [list | add <path> [name] | remove <name> | status]

## Arguments

- `list` — display all registered repositories
- `add <path> [name]` — add a repository to the registry
- `remove <name>` — remove a repository from the registry
- `status` — show status of all registered repositories

## What Happens

### List (or no arguments)

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

### Execution Flow (for coordinated feature/fix)

**Step 1: Analyze Repos**

`@multi-repo-coordinator` reads `.planning/config.json` and produces a registry summary. If any path fails to resolve, the flow stops here with a clear error.

**Step 2: Identify Dependencies**

`@multi-repo-coordinator` and `@architect` work together to:
1. Build the dependency graph from service roles and actual API references
2. Classify the change as breaking or non-breaking for each affected service
3. Produce the ordered change list

If circular dependency is detected, the flow stops and reports the cycle.

**Step 3: Plan Changes**

`@architect` produces the cross-repo CHANGE PLAN using contract-first development:
1. Write the new API contract or type definition before any implementation starts
2. Confirm the contract covers all required changes without scope creep
3. Produce a per-repo task list ordered by the dependency graph

**Step 4: Execute Per Repo**

Changes execute in dependency order. For each repo:
1. Implementation agent implements the changes
2. `@tester` writes and runs tests for that repo's changes
3. No downstream repo starts until upstream repo's changes pass tests

For non-breaking changes, implementation and testing run in parallel. For breaking changes, `@tester` must verify upstream before downstream implementation starts.

If a repo fails, that repo and all downstream repos are paused. Upstream repos that completed are not rolled back.

**Step 5: Verify Integration**

After all per-repo changes complete, `@tester` and `@reviewer` run cross-repo verification:
- `@tester` (integration): runs end-to-end integration tests covering the full change path
- `@reviewer` (cross-repo): reviews all changed files across all repos for contract adherence

Both run in parallel. Integration test failures block the production rollout.

**Rollout After Integration Pass**

Once integration is verified in staging, deploy in dependency order:
```
1. shared-types  →  publish to package registry (semver minor)
2. user-service  →  canary (5% traffic, 15 min) → stage ✅ → prod
3. order-service →  canary (after user-service prod) → stage ✅ → prod
4. api-gateway   →  canary (after order-service prod) → stage ✅ → prod
```

## Conflict Handling

If a conflict is detected during Step 2 or Step 3, the flow pauses:
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
| Integration test fails | Block production rollout; report which test failed |
| Conflict detected | Pause flow; surface options; wait for human decision |

## Output / State

- `.planning/config.json` updated with repo registry
- Per-repo state tracked across phases
- Cross-repo integration verified

## Examples

**List all registered repos:**
```
/fd-multi-repo list
```

**Add a repo:**
```
/fd-multi-repo add ../user-service
```

**Add a repo with custom name:**
```
/fd-multi-repo add ../order-service order-service
```

**Remove a repo:**
```
/fd-multi-repo remove shared-types
```

**Check status across all repos:**
```
/fd-multi-repo status
```

## Related Commands

- `/fd-new-feature` — start a new feature in a single repo
- `/fd-status` — view current state across repos
- `/fd-deploy-check` — run pre-deployment checks across all affected repos