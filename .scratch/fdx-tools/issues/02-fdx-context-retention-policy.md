# 02 — Add `fdx-context` retention / compaction policy

Type: task
Status: open
Triage: ready-for-agent

## Context

Plan-eng-review (D15) found that `fdx-context` write side has no length cap. `formatContextPacket`'s `Recent context` field (D5 A — inlined as `readFileSync(topicContextPath)`) will read the last 10 lines. If `context.md` grows to 50 lines (a topic with many subagent runs), the context packet's "Recent context" silently includes all 50 lines prepended. The plan's own Open Question #2 ("not in PR. Add if/when real topic hits 30+ entries") defers this — but the cost is paid in token bloat, not in disk usage.

## Why

Every delegation reads the context packet. A 50-line `context.md` is a real token-cost regression. Plan-eng-review caught this as MEDIUM severity (suppressed from main report) but the user's accepted A option means we should at least cap the field at write time.

## Pros

- Bounded token cost per delegation.
- No surprise 10x growth in context packet size.

## Cons

- Adds an argument to `fdx-context append` (default `max_lines=10`).
- FIFO truncation at write time means oldest entries are lost — minor observability cost.

## Where to start

1. Edit `src/tools/fdx-context.ts`: add `max_lines` arg (default 10, hard cap 30).
2. At write time, count existing lines; if `existing + 1 > max_lines`, truncate the oldest to keep room for the new entry.
3. Add a unit test that writes 15 lines and asserts only the last 10 survive.

## Depends on / blocked by

- The 4 tools PR must land first.
