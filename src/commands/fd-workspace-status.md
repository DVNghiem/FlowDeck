---
description: Display workspace overview — all repos, their current phase, status, and progress
---

# Workspace Status

Display an overview of all repositories registered in the workspace.

## Steps

1. Read `.planning/config.json` for the list of registered repos.
   - If no repos registered, show status for the current directory only.

2. For each repo, read its `.planning/STATE.md`:
   - Current phase, status, last_updated
   - Plan confirmed flag

3. Display workspace overview:

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

4. Highlight any repos with:
   - `status: blocked` → show with ⚠️
   - `plan_confirmed: false` + `status: in_progress` → note: "plan not confirmed"
