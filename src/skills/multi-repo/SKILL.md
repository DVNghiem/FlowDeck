---
name: multi-repo
description: Coordinate changes across multiple repositories in a microservice architecture. Manages cross-repo dependencies, API contract evolution, and ordered rollouts.
origin: FlowDeck
---

# Multi-Repo Skill

Provides the patterns and vocabulary for planning, sequencing, and executing changes that span more than one repository in a microservice system.

## When to Activate

Activate when:
- A feature or fix requires changes in two or more repositories
- An API contract in one service must change and consumers exist in other repos
- A shared library version bump ripples downstream
- You need to verify no two services are making incompatible concurrent changes

Do not activate for single-repo changes, even if the repo is part of a larger microservice system.

## Architecture Patterns

### Service Mesh

Services communicate through well-defined contracts (REST, gRPC, event schemas). No direct database sharing between services. Each service owns its data store.

Key implication: contract changes are the primary coordination surface. A service can change its internals freely; it cannot change its contract without coordinating consumers.

### API Contracts

Every `upstream-api` service maintains a contract — the stable interface it promises to consumers. Contracts define:
- Endpoint paths and HTTP methods (or gRPC service definitions)
- Request and response schemas (fields, types, nullability)
- Error response shapes
- Authentication requirements
- Rate limits and SLAs (where relevant)

Contracts are the input to `@architect` when designing cross-repo changes.

### Event-Driven Changes

For services that communicate via message queues or event streams:
- The event schema plays the same role as an API contract
- Producers must publish the new schema before consumers update their handlers
- Both old and new schema versions must be supported during the transition window
- Treat schema changes with the same breaking/non-breaking classification used for REST APIs

## Microservice Role Vocabulary

| Role | Meaning |
|------|---------|
| `upstream-api` | Provides an API consumed by other services |
| `downstream-consumer` | Calls one or more upstream APIs |
| `shared-lib` | Imported as a package dependency by other services |
| `gateway` | Routes external traffic to internal services |
| `worker` | Processes background jobs; no inbound HTTP API |

## Config Schema

The multi-repo registry lives at `.planning/config.json` in the root repository.

```json
{
  "sub_repos": [
    {
      "name": "user-service",
      "path": "../user-service",
      "role": "upstream-api",
      "tech_stack": "node+typescript",
      "owner_team": "platform"
    },
    {
      "name": "order-service",
      "path": "../order-service",
      "role": "downstream-consumer",
      "tech_stack": "node+typescript",
      "owner_team": "commerce"
    },
    {
      "name": "shared-types",
      "path": "../shared-types",
      "role": "shared-lib",
      "tech_stack": "node+typescript",
      "owner_team": "platform"
    },
    {
      "name": "api-gateway",
      "path": "../api-gateway",
      "role": "gateway",
      "tech_stack": "nginx+lua",
      "owner_team": "infra"
    }
  ]
}
```

**Field definitions:**
- `name` — unique identifier used in dependency graph and change plans
- `path` — relative path from the root repo's parent directory (the directory containing `.planning/`)
- `role` — service role from the vocabulary above; determines dependency ordering
- `tech_stack` — technology used; informs which tools and commands to run
- `owner_team` — team responsible; flagged in conflict reports and escalations

## Cross-Repo Workflow

### When to Use Feature Branches vs Trunk Per Repo

**Feature branches per repo:**
- Use when the change spans multiple repos and involves breaking API changes
- Each repo gets its own branch (e.g., `feature/refresh-token-support`)
- Branch per repo enables coordinated review before any deploy
- Merge in dependency order: upstream merged and released before downstream merges

**Trunk-based per repo:**
- Use when the change is non-breaking (additive field, new optional endpoint)
- Changes can be merged independently to each repo's main branch
- Downstream consumers update on their own schedule
- Safe because the old contract remains valid during transition

Decision rule: if any change in the set is breaking for any consumer, use feature branches. If all changes are non-breaking, trunk-based is fine.

## Contract-First Development Pattern

For any cross-repo change involving an API:

1. **Write the new contract first** — `@architect` produces the updated interface definition before any code is written
2. **Review the contract in isolation** — confirm all affected teams agree before implementation starts
3. **Implement upstream against the new contract** — `@backend-coder` in the upstream repo
4. **Implement downstream against the new contract** — `@backend-coder` in each consumer repo, independently
5. **Integration test** — verify upstream and downstream work together against the contract

This pattern allows Wave 3 parallelism (upstream and downstream `@backend-coder` agents can work simultaneously from the same contract) even across repos.

## Breaking vs Non-Breaking API Changes

### Non-Breaking (safe to deploy independently):
- Adding a new optional field to a response object
- Adding a new endpoint (existing endpoints unchanged)
- Adding an optional request parameter
- Relaxing a validation rule (e.g., allowing a longer string)
- Adding a new event type to a message stream

### Breaking (requires coordinated rollout):
- Removing a field from a response object
- Renaming an existing field
- Changing a field's type (e.g., string → number)
- Making an optional field required
- Removing or renaming an endpoint
- Changing the authentication scheme
- Modifying an existing event schema in an incompatible way

When a breaking change is unavoidable, use versioned paths (`/v2/endpoint`) to maintain the old contract alongside the new one during the transition window. Retire the old version only after all consumers have migrated.

## Rollout Sequencing

Changes deploy in dependency order. The general sequence:

```
1. shared-lib  →  publish new version (semver bump)
2. upstream-api  →  canary → stage → prod
3. downstream-consumers  →  canary → stage → prod (after upstream is in prod)
4. gateway  →  route config update after all services are live in prod
```

**Canary phase:** 5% of traffic, monitor error rate and latency for 15 minutes before proceeding.
**Stage phase:** full deploy to staging environment, run integration tests.
**Prod phase:** full production deploy after stage passes.

For breaking changes, complete the full canary → stage → prod cycle for the upstream before starting the canary phase for any downstream consumer. Mixed versions in prod during a breaking change window will cause errors.

## Conflict Detection Rules

Two concurrent changes conflict when:
- Both change the same endpoint's response shape in incompatible ways
- Both require incompatible versions of the same shared-lib
- Both claim the same gateway route prefix
- Both migrate the same database table in incompatible directions

Conflicts must be resolved before any CHANGE PLAN is executed. The `@multi-repo-coordinator` surfaces conflicts with resolution options; the relevant `owner_team` decides.

## Independence Check Before Executing

Before running `/fd-multi-repo`:
- [ ] `.planning/config.json` has a `sub_repos` array with at least two entries
- [ ] All `path` values resolve to actual directories on disk
- [ ] Each repo has its own `.git` directory (they are separate repos, not subtrees)
- [ ] You have read access to all repos in the registry