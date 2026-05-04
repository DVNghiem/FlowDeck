---
description: View project status — combined status, roadmap, workspace overview, and progress
argument-hint: [--roadmap | --workspace | --phase=N]
---

# Status

View project status combining progress, roadmap, and workspace overview.

## Modes

### Default (no flags)
Show current phase status summary from STATE.md.

### Roadmap (`--roadmap`)
Display project roadmap with phase statuses.

### Workspace (`--workspace`)
Display overview of all registered repositories.

### Phase Detail (`--phase=N`)
Show detailed progress for a specific phase.

## Examples

```
/fd-status
/fd-status --roadmap
/fd-status --workspace
/fd-status --phase=2
```