# Multi-Repo

FlowDeck can coordinate changes across multiple repositories in a single session. Each repository is registered with the session, assigned a role, and managed through the `/fd-multi-repo` command. Coordination state is persisted in `.planning/multi-repo/` so sessions can be resumed.

---

## /fd-multi-repo Command

The `fd-multi-repo` command is the entry point for all multi-repo operations. It supports four subcommands:

| Subcommand | Description |
|------------|-------------|
| `fd-multi-repo add <path> [role]` | Register a repository at `<path>` with an optional role |
| `fd-multi-repo remove <path>` | Unregister a repository |
| `fd-multi-repo list` | Print all registered repositories and their roles |
| `fd-multi-repo status` | Show sync state, pending changes, and divergence status |

**Roles** classify the repository's purpose in the session:

| Role | Meaning |
|------|---------|
| `primary` | The main development repository (default for the first added) |
| `library` | An internal library or shared module |
| `service` | A microservice or backend API |
| `frontend` | A frontend application |
| `config` | A configuration or infrastructure repository |

The role determines how FlowDeck routes planning and which agents are responsible for changes to that repo.

### Adding a Repository

```bash
fd-multi-repo add /home/user/project-lib library
```

This:

1. Verifies the path exists and is a git repository
2. Reads the `flowdeck.json` config if present in that repo
3. Records the repo in `.planning/multi-repo/REPOSITORIES.json`
4. Runs `/fd-map-codebase` on the new repository to index it into `.codebase/<repo-name>/`

### Removing a Repository

```bash
fd-multi-repo remove /home/user/project-lib
```

This removes the repository from `REPOSITORIES.json` and deletes its `.codebase/<repo-name>/` index. It does not delete any files.

---

## Coordination State

All multi-repo state lives under `.planning/multi-repo/`:

```
.planning/multi-repo/
  REPOSITORIES.json      — registered repos, roles, paths
  CHANGES.json           — pending cross-repo changes
  DEPENDENCIES.json      — dependency graph between repos
  SYNC.json              — sync status and divergence flags
```

### REPOSITORIES.json

```json
{
  "repositories": [
    {
      "name": "flowdeck",
      "path": "/home/user/flowdeck",
      "role": "primary",
      "addedAt": "2026-05-26T08:00:00Z",
      "lastSynced": "2026-05-26T10:00:00Z"
    },
    {
      "name": "flowdeck-lib",
      "path": "/home/user/flowdeck-lib",
      "role": "library",
      "addedAt": "2026-05-26T08:05:00Z",
      "lastSynced": "2026-05-26T09:55:00Z"
    }
  ]
}
```

### CHANGES.json

Tracks planned or in-progress changes that span multiple repositories:

```json
{
  "changes": [
    {
      "id": "ch-001",
      "description": "Add telemetry API to flowdeck-lib",
      "status": "planned",
      "affectedRepos": ["flowdeck-lib", "flowdeck"],
      "planRef": ".planning/PLAN.md#ch-001"
    }
  ]
}
```

### DEPENDENCIES.json

Records declared dependencies between repositories (e.g., `flowdeck` imports `flowdeck-lib`):

```json
{
  "dependencies": [
    {
      "from": "flowdeck",
      "to": "flowdeck-lib",
      "type": "import",
      "files": ["src/lib/telemetry.ts"]
    }
  ]
}
```

Dependencies are inferred from import analysis during `/fd-map-codebase` but can be manually overridden in `flowdeck.json`.

---

## Cross-Repo Planning

When `/fd-plan` runs in a multi-repo session:

1. The `@planner` agent reads `DISCUSS.md` and `FEATURE.md` as usual
2. For each planned task, it checks `DEPENDENCIES.json` to determine which repository the task belongs to
3. Tasks are organized by repository, then by wave within each repository
4. Tasks that span multiple repositories (e.g., adding an API to a library and updating callers in the primary) are marked as **cross-repo tasks** and placed in a shared wave

**Cross-repo wave execution:**

```
Wave 1 (parallel across repos)
  ├── [flowdeck-lib] Task 1a: Add telemetry API      → @coder (flowdeck-lib)
  └── [flowdeck]     Task 1b: Update telemetry callers → @coder (flowdeck)

Wave 2 (sequential, primary waits for library)
  └── [flowdeck]     Task 2a: Run integration tests    → @tester
```

The orchestrator enforces that all tasks in Wave 1 complete before Wave 2 begins, even across repositories.

---

## Cross-Repo Execution

During `/fd-execute`, the orchestrator:

1. Iterates through waves
2. For each wave, dispatches tasks to their target repositories in parallel
3. Each agent operates in its assigned repository's working directory
4. The `DEADLOCK_SIGNALS.jsonl` from each repository is aggregated into the primary repo's `.codebase/`
5. If a task in one repository depends on output from another, the orchestrator waits for the source task to complete first

### File Coordination

When a change in one repository depends on a change in another:

- The dependency is declared in `DEPENDENCIES.json`
- The planner ensures the source task runs before the dependent task
- If both repos are on the same filesystem, FlowDeck uses absolute paths
- If repos are on different machines, FlowDeck uses git worktree references or suggests a shared git remote

---

## Multi-Repo State Sync

Use `fd-multi-repo status` to see the current state:

```
fd-multi-repo status

Repository: flowdeck (primary)
  Path: /home/user/flowdeck
  Role: primary
  Last synced: 2026-05-26 10:00:00
  Status: clean ✓

Repository: flowdeck-lib (library)
  Path: /home/user/flowdeck-lib
  Role: library
  Last synced: 2026-05-26 09:55:00
  Status: 2 commits ahead of remote
  Pending:
    - ch-001: Add telemetry API

Cross-repo changes:
  ch-001: Add telemetry API to flowdeck-lib
    Status: planned
    Affects: flowdeck-lib, flowdeck
    Blocker: none
```

---

## Configuration

Declare multi-repo dependencies explicitly in `flowdeck.json` to override inferred dependencies:

```json
{
  "multiRepo": {
    "repositories": [
      {
        "name": "flowdeck-lib",
        "path": "/home/user/flowdeck-lib",
        "role": "library"
      }
    ],
    "dependencies": [
      {
        "from": "flowdeck",
        "to": "flowdeck-lib",
        "type": "import"
      }
    ]
  }
}
```

This is useful when FlowDeck cannot infer dependencies from imports (e.g., binary dependencies, API contracts, or generated files).
