---
name: fd-done
description: Close a verified FlowDeck task by checking requirements against evidence
disable-model-invocation: true
argument-hint: "[topic]"
---

# FlowDeck done

Close state only after `/flowdeck:fd-verify` has established a verified outcome. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" status [topic]` and resolve the selected topic. If state/task is missing, direct the user to `/flowdeck:fd-task`. Require `verification: verified` and no unresolved blockers; legacy `status: verified` is interpreted only through compatibility reading. Otherwise direct to `/flowdeck:fd-verify` and stop.

Read every requirement and acceptance criterion from `task.md`. Compare each against the actual working diff, command output, and applicable review/security findings. Mark each criterion met or unmet and cite evidence. Do not infer success from a summary or mark incomplete work done. FAST/STANDARD may use inline steps without `plan.md`; FULL requires all four planning artifacts. Read `affect.md` when it exists.

If any criterion is unmet, leave lifecycle open and report gaps. If all are met, set `status complete` and `verification verified` separately with `state.mjs set`, update `last_action`/`next_action`, then run `state.mjs checkpoint fd-done complete`. Preserve checkpoint fields. If writing fails, report the failure and do not claim closure.

Summarize requirements met, verification evidence, files changed, remaining gaps, and whether a commit/push happened earlier by separate explicit request. You may suggest a commit message or next task. **Never run git commit, git push, deploy, or destructive repository operations as part of `/flowdeck:fd-done`.**
