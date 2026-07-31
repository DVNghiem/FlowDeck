---
name: context-steward-triggers
description: Auto-loaded context health triggers — thresholds and quick actions. Full 6-step pipeline in context-steward skill (load on demand).
always_on: false
origin: FlowDeck
---

# Context Health Triggers

Check context health after every stage transition and after every 3 task() calls.

## Thresholds

| Context Usage | Action |
|---------------|--------|
| > 40% | Run 3-pass prune (dedup → purge errors → compress stale) |
| > 60% | Compact + prune, then /fd-checkpoint |
| > 80% | /fd-checkpoint immediately before continuing |

Also trigger prune when:
- Multiple agents have contributed outputs in one session
- About to switch stages (fd-task → fd-review → fd-execute → fd-verify → fd-done)
- Any single tool output exceeds ~5000 tokens

## Quick Actions

**Prune** (< 60%): Remove duplicate reads, resolved errors, stale turns. Keep session alive.
**Compact** (60–80%): Replace ranges with summaries + evidence links. Then checkpoint.
**Checkpoint** (> 80% or task complete): `/fd-checkpoint` → start fresh session.

## Protected — Never Prune

`AGENTS.md`, `STATE.md`, active `PLAN.md`, `DECISIONS.jsonl`, `FAILURES.json`,
last 2 user messages, in-flight tool results.

## Full Pipeline

Load the `context-steward` skill on demand when executing a prune.
