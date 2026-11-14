---
name: fd-status
description: Report FlowDeck lifecycle, tier artifacts, verification, checkpoint, and capability health
disable-model-invocation: true
argument-hint: "[topic|--all]"
---

# FlowDeck status

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" status [topic]` from the project root. This reports the canonical hashed planning root, active topic, lifecycle, verification outcome, workflow tier, artifact presence, checkpoint, FDX/Node/Claude versions, and whether hook files exist. If state is missing, print the exact `/flowdeck:fd-task` remedy. If an explicit topic is supplied, verify that its directory exists before reporting it.

Read checkpoint first for current command/stage and phase progress; fall back to STATE fields when checkpoint is missing or unreadable, and state which source was used. Keep lifecycle (`planned|in_progress|complete|blocked`) separate from verification (`verified|not_verified`). Do not treat verification as a lifecycle state.

Artifact expectations: FAST requires `task.md` with inline steps; STANDARD requires `task.md` and may have `affect.md`; FULL requires `task.md`, `architecture.md`, `affect.md`, and `plan.md`. Existing all-four-file tasks remain supported. Report absent optional artifacts as N/A, not blockers. For required missing artifacts, name the file and suggest `/flowdeck:fd-task`.

For `--all`, enumerate topic directories under the reported canonical planning root, and summarize each topic's lifecycle, verification, tier, current stage, and artifact completeness. Do not derive a topic stage from file presence alone when state/checkpoint evidence disagrees.

Show FDX version or degraded/unavailable reason. Without FDX, make no graph-impact claims. Report Node and Claude CLI versions. Hook presence/executable checks do not prove the host loaded hooks or enforces them; if load state is unknown, say `unknown`. Safety is not guaranteed by SessionStart. Report unattributed legacy-state warnings and do not merge them into the current hashed workspace automatically.

Use a compact pipeline summary (`fd-task → fd-review → fd-execute → fd-verify → fd-done`) with completed/current/pending stages, artifact checklist, verification gaps, blockers, and a concrete next command. Do not write state or modify repository files in status mode.
