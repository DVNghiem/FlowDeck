#!/bin/sh
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'FlowDeck guard cần Node; sửa PATH hoặc tắt plugin' >&2
  exit 2
fi
exec node "${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}/hooks/policy.mjs"
