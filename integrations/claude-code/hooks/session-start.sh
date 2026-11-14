#!/bin/sh
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'FlowDeck cần Node để chạy guard; sửa PATH hoặc tắt plugin.' >&2
  printf '%s\n' 'FlowDeck guard is unavailable: Node is missing. Restore PATH or disable this plugin.'
  exit 0
fi
cat <<'CONTEXT'
FlowDeck workflow: /flowdeck:fd-task → /flowdeck:fd-review → /flowdeck:fd-execute → /flowdeck:fd-verify → /flowdeck:fd-done.
Use /flowdeck:fd-checkpoint and /flowdeck:fd-resume for single-host recovery; /flowdeck:fd-status for health.
Respond in the language used by the user in the current conversation.
Use RED → GREEN → REFACTOR for behavior changes and run verification before claiming completion.
Do not commit, push, deploy, or perform destructive repository operations without explicit user authorization.
Read only the conversation context available to this session; mark inferred requirements as proposed.
FDX is optional. If unavailable, inspect ordinary repository files and report reduced confidence.
Plugin hooks can be disabled or bypassed; do not describe them as a complete security boundary.
CONTEXT
