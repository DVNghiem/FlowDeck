---
name: context-guard
description: Protect critical context from pruning during compaction. Preserve active plans, safety files, pending operations, and user intent anchors.
origin: FlowDeck
---

# Context Guard Skill

Defines the protected-pattern contract: a whitelist of files, tools, decisions, and messages that must survive context compaction.

## What Is a Protected Pattern?

A protected pattern is any context item that a pruning pass must skip. Without it, compaction can silently discard the very state an agent needs to finish a task.

Four categories:

### Tool Patterns

Tool invocations that must remain in the conversation window while they are in flight or unverified. Example: a `write` or `edit` call whose result has not yet been confirmed.

### File Patterns

Paths that anchor the current session. These include active planning files, project conventions, and safety ledgers.

### Decision Records

Records that explain why the session is in its current state. Removing them forces the agent to re-derive intent from scratch.

### Intent Anchors

User messages that establish the original goal and the most recent steering corrections. These are the cheapest way to prevent drift.

## Default Protected-Pattern Registry

FlowDeck ships with a default registry. Override it in `.opencode/flowdeck/protected-patterns.yaml`, never by editing this skill.

### System Files

| Pattern | Reason |
|---|---|
| `AGENTS.md` | Operating rules for every agent |
| `.planning/STATE.md` | Current phase, completed steps, blockers |
| `.planning/PLAN.md` | Active plan and success criteria |

### Safety Files

| Pattern | Reason |
|---|---|
| `.codebase/DECISIONS.jsonl` | Decision ledger — why choices were made |
| `.codebase/FAILURES.json` | Failure replay engine data |

### Intent Anchors

| Pattern | Reason |
|---|---|
| Last 2 user messages | Original goal + latest steering |
| Current phase objective | From STATE.md — the single sentence that defines success |

### Active Operations

Any pending tool whose side effects have not been verified:

| Tool | Condition |
|---|---|
| `write` | while pending verification |
| `edit` | while pending verification |
| `bash` | while exit code/output not yet checked |

## Guard Protocol

Before any pruning or compaction run, `context-steward` executes this protocol:

1. **Enumerate** — load the default registry and any user overrides
2. **Resolve** — expand patterns to concrete files, tool IDs, and message indices
3. **Check** — for every candidate marked for removal, test against the registry
4. **Block** — if the candidate matches a protected pattern, keep it
5. **Log** — record each blocked removal to telemetry with reason and pattern

Only items that survive the guard pass are eligible for compaction. The protocol is fail-closed: when in doubt, protect.

## Template Registry

Create `.opencode/flowdeck/protected-patterns.yaml`:

```yaml
protected:
  files:
    - pattern: ".planning/STATE.md"
      reason: "session state"
    - pattern: ".planning/PLAN.md"
      reason: "active plan"
    - pattern: ".codebase/DECISIONS.jsonl"
      reason: "decision ledger"
    - pattern: ".codebase/FAILURES.json"
      reason: "failure replay data"
    - pattern: "AGENTS.md"
      reason: "agent operating rules"
  tools:
    - name: "write"
      while: "pending"
    - name: "edit"
      while: "pending"
    - name: "bash"
      while: "pending"
  messages:
    - type: "user"
      count: 2
  decisions:
    - source: ".codebase/DECISIONS.jsonl"
      count: 5
```

## Integration Notes

### `context-steward`

`context-steward` calls `context-guard` before every compaction pass:

- Pass the candidate removal list to the guard
- Receive the protected subset
- Remove only the non-protected remainder
- Write guard events to telemetry

Users do not call `context-guard` directly. It is a dependency of the compaction pipeline.

### Adding Project-Specific Patterns

1. Create `.opencode/flowdeck/protected-patterns.yaml`
2. Merge rules with the default registry (user patterns take precedence)
3. Re-run compaction to verify protection

Project patterns are appropriate for:

- Domain-specific safety files (e.g., `MIGRATIONS.md`, `SCHEMA.md`)
- Regulatory audit logs
- Long-running operation state files

Do not add transient build artifacts or cache files. Those are noise, not signal.

## Anti-Patterns

### Protecting Everything

If every file and message is protected, compaction becomes a no-op. The registry exists to make pruning safe, not to disable it. Protect only items whose loss would force the agent to restart the task.

### Exact-Filename Protection

A pattern like `STATE.md` misses `.planning/STATE.md`. A pattern like `PLAN.md` misses phase-specific plans at `.planning/phases/phase-3/PLAN.md`. Use glob-style or prefix patterns so protection survives path changes.

### Leaving Temporary Files Protected

A `write` call that has been verified, or a temporary scratch file from a completed operation, should not remain in the registry. Temporary protection must expire when the operation completes.

### Protecting Raw Tool Output

Large outputs (`git diff`, test logs, MCP responses) are usually not state. Summarize them and protect the summary, not the full output.

## Quick Reference

| Pattern Type | Example | Keep Condition |
|---|---|---|
| File | `.planning/STATE.md` | Always |
| File | `.codebase/DECISIONS.jsonl` | Always |
| Tool | `write` | While pending |
| Tool | `edit` | While pending |
| Message | User turn | Last 2 |
| Decision | `.codebase/DECISIONS.jsonl` | Last 5 entries |

## Related Skills

- [`context-load`](./context-load/SKILL.md) — what to load at session start
- [`context-budget`](./context-budget/SKILL.md) — when and why to compact
