---
description: Open project dashboard in browser — displays phase progress, milestones, and blockers
argument-hint: [--port=N]
---

# Dashboard

Open the FlowDeck project dashboard.

**Input:** $ARGUMENTS — optional `--port=N` (default: 3847)

## Steps

1. Check `.planning/STATE.md` exists — if not, error: "No active project. Run /fd-new-project first."

2. Read project state from:
   - `.planning/STATE.md` — current phase, status, progress
   - `.planning/ROADMAP.md` — all phases and completion status
   - `.planning/phases/phase-*/PLAN.md` — step completion per phase

3. Try to start the dashboard server if not running:
   ```bash
   npx @dv.nghiem/flowdeck-dashboard --port <port> &
   ```
   Or if the package is installed, run:
   ```bash
   flowdeck-dashboard --port <port> &
   ```

4. If server cannot start, display a text-based dashboard instead:

```
════════════════════════════════════════════
FLOWDECK DASHBOARD
════════════════════════════════════════════
Project: <name from PROJECT.md>
Updated: <last_updated>

ROADMAP
  ✅ Phase 1: Setup           — completed
  🔄 Phase 2: Core Feature    — in progress (3/7 steps)
  ⏳ Phase 3: Polish          — planned

CURRENT PHASE (2): Core Feature
  ✅ Step 1: Set up database schema
  ✅ Step 2: Create API endpoints
  ✅ Step 3: Add authentication
  ⬜ Step 4: Write tests
  ⬜ Step 5: Write documentation

BLOCKERS
  - (none)
════════════════════════════════════════════
Run /fd-progress for detailed state view.
```

5. If server starts: report the URL: "Dashboard running at http://localhost:<port>"
