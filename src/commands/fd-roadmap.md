---
description: View or update project roadmap — displays ROADMAP.md, shows phase statuses, add new phase, or mark phase complete
argument-hint: [--add "Phase Name" | --complete N | --list]
---

# Roadmap

View or update the project roadmap.

**Input:** $ARGUMENTS

## Behavior

### View Roadmap (no args or `--list`)

1. Read `.planning/ROADMAP.md` — if not found, error: "Run /fd-new-project first."
2. Read `.planning/STATE.md` for current phase and completed phases.
3. Display the roadmap with status indicators:

```
═══════════════════════════════════════
PROJECT ROADMAP
═══════════════════════════════════════
  ✅ Phase 1: <name> — completed
  🔄 Phase 2: <name> — in progress  ← current
  ⏳ Phase 3: <name> — planned
═══════════════════════════════════════
Current: Phase 2 | Status: in_progress
```

### Add Phase (`--add "Phase Name"`)

Append a new phase row to the `ROADMAP.md` overview table with status `planned`.

Update STATE.md `total_phases` counter.

Report: "Phase <N> '<name>' added."

### Mark Complete (`--complete N`)

1. Update ROADMAP.md to mark phase N as completed.
2. Update STATE.md:
   - Increment `completed_phases`
   - Advance `phase` to N+1 if N is current phase
   - Set new phase `status: planned`
3. Report: "Phase N marked complete. Now on phase N+1."
