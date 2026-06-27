---
description: View project status — combined status, roadmap, workspace overview, and progress
argument-hint: [--roadmap | --workspace | --phase=N]
---

# Status

View project status combining progress, roadmap, and workspace overview.

**Input:** $ARGUMENTS — optional flags

## Modes

### Default (no flags)

Read `.planning/STATE.md` and display combined status:

```
════════════════════════════════════════════════════════════
Phase: <N>  |  Status: <status>  |  Updated: <timestamp>
────────────────────────────────────────────────────────────
Plan: <X> steps (<Y> complete)
Plan confirmed: <yes/no>
════════════════════════════════════════════════════════════
```

### Roadmap (`--roadmap`)

Display project roadmap with phase statuses:

```
═══════════════════════════════════════
PROJECT ROADMAP
═══════════════════════════════════════
  ✅ Phase 1: <name> — completed
  🔄 Phase 2: <name> — in progress  ← current
  ⏳ Phase 3: <name> — planned
═══════════════════════════════════════
```

Read from `.planning/ROADMAP.md` and `.planning/STATE.md`.

### Workspace (`--workspace`)

Display overview of all registered repositories:

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

Read from `.planning/config.json` for repo list, each repo's STATE.md for phase/status.

### Phase Detail (`--phase=N`)

Show detailed progress for a specific phase:

```
════════════════════════════════════════════════════════════
PHASE <N> DETAIL
════════════════════════════════════════════════════════════
Status: <status>
Plan file: <path>
Plan confirmed: <yes/no>

Steps:
  ✅ Step 1: <name> — completed
  🔄 Step 2: <name> — in progress
  ⬜ Step 3: <name> — pending
  ⬜ Step 4: <name> — pending
════════════════════════════════════════════════════════════
```

## Error Handling

- If `.planning/STATE.md` not found: "No active workspace. Run `/fd-init-deep` to initialize, then `/fd-new-feature` to start a feature."
- If `--phase` requested but phase directory doesn't exist: "Phase N not found."