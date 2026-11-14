---
name: fd-checkpoint
description: Force-save FlowDeck task progress and checkpoint for same-host resume
disable-model-invocation: true
argument-hint: "[stage]"
---

# FlowDeck checkpoint

Use this to force-save before ending a session or after a meaningful execution stage. FlowDeck's Claude hook does not automatically checkpoint on OpenCode's `session.idle` event, so do not imply that it has.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" status` from the project root to resolve the active topic and canonical planning directory. If no workspace exists, direct the user to `/flowdeck:fd-task`. Read `STATE.md` and existing `checkpoint.json` before saving. For FULL, inspect plan checkboxes; for FAST/STANDARD, inspect inline steps in `task.md`. Update completed/pending steps only when supported by evidence. Never change verification based only on checkpointing.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" checkpoint fd-checkpoint <stage>`; use the current command/stage, not an invented one. The script atomically merges checkpoint fields and preserves prior state. If checkpoint input is malformed or the command fails, report the failure and do not say it is safe to close. State that this is same-host/single-writer only; no cross-host lock or live handoff is implemented.

Report topic, lifecycle, tier, verification, current stage, pending steps, blockers, exact saved checkpoint path, and whether saving succeeded. Do not commit, push, or alter repository source as part of checkpointing.
