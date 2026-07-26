# /fd-status

**Purpose:** View project progress, roadmap phase statuses, and workspace overview — combined status display with optional detailed flags.

## Usage

/fd-status [--roadmap | --workspace | --phase=N]

## What Happens

### Default (no flags)

Reads `.planning/STATE.md` and displays:
```
Phase: <N>  |  Status: <status>  |  Updated: <timestamp>
────────────────────────────────────────────────────────────
Plan: <X> steps (<Y> complete)
Plan confirmed: <yes/no>
```

### Roadmap (`--roadmap`)

Reads `.planning/ROADMAP.md` and `.planning/STATE.md` and displays:
```
═══════════════════════════════════════
PROJECT ROADMAP
═══════════════════════════════════════
  ✅ Phase 1: <name> — completed
  🔄 Phase 2: <name> — in progress  ← current
  ⏳ Phase 3: <name> — planned
═══════════════════════════════════════
```

### Workspace (`--workspace`)

Reads `.planning/config.json` for registered repositories and each repo's STATE.md, displaying:
```
════════════════════════════════════════════════════
WORKSPACE OVERVIEW
════════════════════════════════════════════════════
  frontend   — Phase 2 | in_progress  | Plan: ✅ | Updated: <time>
  backend    — Phase 3 | completed    | Plan: ✅ | Updated: <time>
  shared     — Phase 1 | planned      | Plan: ❌ | Updated: <time>
────────────────────────────────────────────────────
Total: 3 repos | 1 in progress | 1 completed | 1 planned
════════════════════════════════════════════════════
```

### Phase Detail (`--phase=N`)

Reads the specific phase's STATE.md and PLAN.md (if exists) and displays:
```
Phase <N> Detail
Status: <status>
Plan file: <path>
Plan confirmed: <yes/no>

Steps:
  ✅ Step 1: <name> — completed
  🔄 Step 2: <name> — in progress
  ⬜ Step 3: <name> — pending
  ⬜ Step 4: <name> — pending
```

## Output / State

No files modified. Read-only display command.

## Examples

```
/fd-status
```

Show current phase summary.

```
/fd-status --roadmap
```

Show full project roadmap with all phase statuses.

```
/fd-status --workspace
```

Show overview of all registered repositories in the workspace.

```
/fd-status --phase=2
```

Show detailed progress for phase 2.

## Related Commands

- `/fd-map-codebase` — map the codebase (required before starting a feature)
- `/fd-execute` — advance phase status by implementing steps
- `/fd-verify` — update phase status to `verified` after full pipeline pass
