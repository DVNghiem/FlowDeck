# Multi-Repo & Microservices

FlowDeck supports coordinating changes across multiple repositories in a microservice architecture. The `@multi-repo-coordinator` agent manages dependency graphs, determines change order, and produces per-repo CHANGE PLANs.

---

## When to Use Multi-Repo Mode

Multi-repo mode is appropriate when:

- A shared API contract is changing and multiple services need to update their clients
- A breaking change requires a coordinated rollout with a specific service order
- A new cross-cutting capability (authentication, distributed tracing, audit logging) must be added to several services at once
- Dependency upgrades need to be applied consistently across a service mesh

Single-repo mode is sufficient for all other work. Multi-repo coordination adds overhead — only enable it when the cross-repo dependency is real.

---

## Setup

### Step 1 — Initialize the root repository

If your root (orchestrating) repository is not already a FlowDeck project:

```
/fd-new-project MyPlatform
```

This creates `.planning/` and `.planning/config.json` in the root repo.

### Step 2 — Register service repositories

```
/fd-multi-repo --add ../user-service upstream-api
/fd-multi-repo --add ../order-service consumer
/fd-multi-repo --add ../notification-service consumer
/fd-multi-repo --add ../api-gateway edge
```

Each `--add` command:
1. Resolves and validates the path
2. Detects the tech stack (language, framework) from the target repo's files
3. Appends an entry to `sub_repos` in `.planning/config.json`

### Step 3 — Verify registration

```
/fd-multi-repo --list
```

Expected output:

```
Registered repositories:
  user-service       ../user-service         role: upstream-api    tech: node+typescript
  order-service      ../order-service        role: consumer        tech: node+typescript
  notification-svc   ../notification-service  role: consumer        tech: python
  api-gateway        ../api-gateway          role: edge            tech: golang
```

---

## config.json sub_repos Schema

Registered repos are stored in `.planning/config.json` under the `sub_repos` key:

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
      "role": "consumer",
      "tech_stack": "node+typescript",
      "owner_team": "commerce"
    },
    {
      "name": "notification-service",
      "path": "../notification-service",
      "role": "consumer",
      "tech_stack": "python",
      "owner_team": "growth"
    },
    {
      "name": "api-gateway",
      "path": "../api-gateway",
      "role": "edge",
      "tech_stack": "golang",
      "owner_team": "platform"
    }
  ]
}
```

All fields except `owner_team` are required. `owner_team` is optional but recommended — it enables `@multi-repo-coordinator` to surface team-level communication needs in the CHANGE PLAN.

---

## Role Vocabulary

The `role` field tells `@multi-repo-coordinator` how each service fits into the dependency graph. It uses this to determine change order and to classify changes as breaking or non-breaking.

| Role | Meaning |
|------|---------|
| `upstream-api` | Exposes an API that other services consume. Changes here propagate outward. |
| `consumer` | Calls one or more upstream APIs. Must update its client when upstream contracts change. |
| `edge` | API gateway or entry point. Routes external traffic and may enforce rate limits or authentication. |
| `shared-lib` | A library imported by other services. Breaking changes here affect every consumer simultaneously. |
| `worker` | Background job processor. Typically a consumer of events or queues; rarely an upstream dependency. |
| `data-store` | Database, cache, or storage service. Schema changes here can be breaking for any direct consumer. |

---

## Running a Cross-Repo Change

Invoke `@multi-repo-coordinator` with a plain-language description of the cross-cutting change:

```
@multi-repo-coordinator I need to add user preferences to the user-service API and
update all consumer services to use the new endpoint.
```

### What `@multi-repo-coordinator` does

1. **Reads `sub_repos`** from `.planning/config.json` to identify all registered services
2. **Builds the dependency graph** — in the example above: `user-service → order-service`, `user-service → notification-service`, and `api-gateway → user-service`
3. **Determines change order** based on roles: upstream services change first, consumers second, edge last
4. **Classifies the change**: adding a new field or endpoint is non-breaking; renaming or removing is breaking. Breaking changes require a compatibility strategy (versioned endpoints, feature flags, or synchronized cutover)
5. **Produces a CHANGE PLAN** for each affected repository in dependency order

---

## CHANGE PLAN Format

`@multi-repo-coordinator` produces a CHANGE PLAN that is saved to `.planning/fd-multi-repo/CHANGE-<timestamp>.md`:

```
CHANGE PLAN — user-preferences feature

Order of changes:
  1. user-service (upstream-api)   — add GET /users/{id}/preferences endpoint
  2. order-service (consumer)      — update UserClient to call new preferences endpoint
  3. notification-service (consumer) — update notification triggers with user preferences
  4. api-gateway (edge)            — add /preferences route, update rate limit policy

Breaking changes: None (additive endpoint — existing clients unaffected)
Rollout strategy: canary → staging → production per service in the order above

Owner teams notified:
  platform (user-service, api-gateway)
  commerce (order-service)
  growth (notification-service)
```

For breaking changes, the CHANGE PLAN includes a compatibility section:

```
Breaking changes: YES — /users/{id} response shape modified (field renamed)
Compatibility strategy:
  - Deploy user-service@v2 alongside v1 (parallel run)
  - Migrate consumers to v2 endpoint one-by-one
  - Deprecate v1 after all consumers are migrated (target: 2 sprints)
  - Remove v1 after deprecation window closes
```

---

## Multi-Repo Workflow

The `multi-repo-flow` workflow orchestrates the full end-to-end process:

1. **Analyze** — `@code-explorer` runs in each registered repo and builds a combined dependency graph
2. **Classify** — `@multi-repo-coordinator` identifies which changes are breaking vs non-breaking and determines service change order
3. **Plan** — produces a CHANGE PLAN per repo in dependency order
4. **Execute** — role-routed implementation agent (`@backend-coder`/`@frontend-coder`/`@devops`) is invoked per repo in order; `@tester` runs per repo in parallel with the selected implementation agent (using that repo's test suite)
5. **Verify** — `@reviewer` and `@security-auditor` run per repo after implementation; integration tests are run across the full service mesh in staging before any production rollout

Each step produces output files in `.planning/fd-multi-repo/` so the entire process is auditable.

---

## Multi-Repo Commands Reference

| Command | What it does |
|---------|-------------|
| `/fd-multi-repo --add <path> <role>` | Register a repo with the given path and role |
| `/fd-multi-repo --list` | Print a table of all registered repos |
| `/fd-multi-repo --status` | Show `git status` summary for every registered repo |
| `/fd-multi-repo --remove <name>` | Remove a repo from `sub_repos` by name |

---

← [Back to Index](index.md)
