---
description: Manage multi-repo registry in .planning/config.json — add, list, status, or remove repos
argument-hint: [list | add <path> [name] | remove <name> | status]
---

# Multi-Repo

Manage a multi-repository workspace registry.

**Input:** $ARGUMENTS

## Behavior

### List (`list` or no arguments)

Read `.planning/config.json` → `repos` array. Display:

```
════════════════════════════════════
MULTI-REPO REGISTRY
════════════════════════════════════
  frontend  — ./packages/frontend  (phase 2, in_progress)
  backend   — ./packages/backend   (phase 3, completed)
  shared    — ./packages/shared    (phase 1, planned)
════════════════════════════════════
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

## Config Format

`.planning/config.json` repos entry:
```json
{
  "repos": [
    { "name": "frontend", "path": "./packages/frontend" }
  ]
}
```
