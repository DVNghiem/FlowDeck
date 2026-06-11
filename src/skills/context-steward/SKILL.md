---
name: context-steward
description: Unified context lifecycle for FlowDeck sessions — ingest, filter, prune, protect, summarize, and persist with telemetry.
origin: FlowDeck
---

# Context Steward

FlowDeck sessions accumulate noise. Tool outputs, rule loads, failed attempts, and multi-agent chatter fill the context window. This skill defines a unified lifecycle to keep context lean, relevant, and recoverable.

## When to Activate

Activate when:
- Context exceeds 50% of the window and response quality drops
- Multiple agents have contributed outputs in one session
- Tool results are large (logs, diffs, file reads)
- You are about to switch phases (plan → execute → verify)
- A `/fd-checkpoint` is imminent

## Core Principles

- **Context is a liability** — every token not serving the current task is a distraction
- **Prune with purpose** — never drop what the agent needs to continue
- **Protect the thread** — user intent, active plans, and safety records are non-negotiable
- **Telemetry is cheap** — write stats before pruning so patterns are visible later

---

## Unified Context Lifecycle

### 1. Ingest

Everything that enters the session window:

| Source | Typical Size | Risk Level |
|--------|-------------|------------|
| User prompts | Small | Low — never prune |
| Tool results (read, edit, bash) | Variable | High — can be huge |
| Skill loads | Medium | Medium — load once per session |
| Rule injections | Small-Medium | Medium — stage-gated already |
| Agent outputs | Medium | Medium — may contain plans or decisions |
| Memory queries | Small | Low |
| `codegraph` results | Small-Medium | Low |

**Ingest discipline**: Before any large output enters context, ask whether it is needed for the next 5 turns. If not, summarize or redirect to file.

---

### 2. Filter

FlowDeck already gates rules by stage. Extend this discipline to all context sources.

| Current Stage | Load | Defer / Skip |
|---------------|------|--------------|
| `discuss` | Behavioral rules, `AGENTS.md` | Coding standards, testing rules |
| `plan` | Architecture rules, planning rules | Security rules, lint rules |
| `execute` | Coding standards, language patterns, security | Debug rules (until needed) |
| `verify` | Testing, security, linting rules | Planning rules |
| `fix-bug` | Debug, testing rules | Architecture rules |

**Filter action**: If a skill or rule is not relevant to the current stage, do not load it. Use `load-rules` on demand rather than pre-loading.

---

### 3. Prune — Three-Pass Pipeline

Pruning is surgical. It runs when context exceeds 50% of the window or when switching tasks.

#### Pass 1: Deduplicate

**What gets pruned**:
- Identical tool outputs repeated across agents (e.g., two agents reading the same file)
- Duplicate skill loads (same skill invoked twice with identical parameters)
- Redundant `codegraph` queries returning the same symbols

**What stays**:
- First occurrence of any unique output
- Outputs with different parameters or timestamps
- User prompts (never deduplicated)

**How to invoke**:
- Agent-triggered: after parallel agent execution, the orchestrator deduplicates before presenting results
- Manual: agents may call a deduplication routine directly; there is no dedicated slash command

**FlowDeck-native pattern**: When `@parallel-coordinator` dispatches 3 agents that all read `src/config.ts`, keep only the first read result. Reference the others by index.

---

#### Pass 2: Purge Errors

**What gets pruned**:
- Failed tool executions that have been superseded by a later success
- Stack traces from resolved errors
- Old build failures after a successful build
- Retry loops where the final attempt succeeded

**What stays**:
- The most recent failure if the issue is still unresolved
- Failures linked to an active `FAILURES.json` entry
- Errors that inform the current debugging session

**How to invoke**:
- Agent-triggered: `@debug-specialist` purges resolved error chains after root cause is found
- Automatic: after `bun test` exits 0, purge prior failing test output

**FlowDeck-native pattern**: If `@build-error-resolver` fixes a type error, purge the type-checker output but keep the fix description in `SESSION_SUMMARY.md`.

---

#### Pass 3: Compress Stale Ranges

**What gets pruned**:
- Old conversation turns (> 10 turns back) not touching current files
- Large file reads from modules no longer being edited
- Tool outputs from completed sub-tasks
- Agent outputs for tasks already merged or abandoned

**What stays**:
- Last 2 user messages (see Protected Patterns)
- Active plan and STATE.md content
- Decisions and failures linked to current work
- Any output touching files in the current `git diff`

**How to invoke**:
- `/fd-checkpoint` — full session save + context clear
- Agent-triggered: `@orchestrator` compresses after each wave in a multi-wave plan

**FlowDeck-native pattern**: Replace 20 turns of exploratory editing on `src/auth.ts` with a single synthetic summary: "Explored 3 approaches for token refresh; selected sliding-window with 15-min expiry. See DECISIONS.jsonl:auth-refresh-2026-06-10."

---

### 4. Protect

Protected patterns are immune to all pruning passes.

#### Category A: Core System

| Pattern | Why Protected |
|---------|--------------|
| Orchestrator rules (`agent-orchestration.md`) | Routing depends on them |
| `AGENTS.md` | Defines agent boundaries and non-negotiables |
| `STATE.md` | Current phase, plan, blockers |
| `PLAN.md` (active) | Success criteria and step order |

#### Category B: Safety

| Pattern | Why Protected |
|---------|--------------|
| `.codebase/DECISIONS.jsonl` | Rationale for current design |
| `.codebase/FAILURES.json` | Prevents repeating failed approaches |
| `.codebase/CONSTRAINTS.md` | Architecture guards |

#### Category C: User Intent

| Pattern | Why Protected |
|---------|--------------|
| Last 2 user messages | Most recent instructions |
| Active plan reference | What the user asked for |
| Explicitly pinned context | User said "keep this in mind" |

#### Category D: Tool-Specific (In-Flight)

| Pattern | Why Protected |
|---------|--------------|
| `write` output for current file | Must verify what was written |
| `edit` diff for current change | Must confirm diff is correct |
| `bash` output for running command | Command may still be relevant |

**Protection rule**: If a tool operation is in-flight or its result is referenced in the next 3 turns, do not prune it. Mark it as pinned until the agent acknowledges it.

---

### 5. Summarize

After pruning, replace removed ranges with synthetic summary messages.

**Summary format**:

```markdown
[Context Steward] Pruned N turns (M tokens). Retained: [list].
Summary: [1-2 sentences]. Evidence: [link to DECISIONS.jsonl or SESSION_SUMMARY.md].
```

**What to summarize**:
- Exploratory edits → decision + chosen approach
- Research → conclusion + source
- Multi-agent discussion → consensus + dissent (if relevant)
- Build/test cycles → final status + any remaining failures

**What NOT to summarize**:
- Active user instructions (keep verbatim)
- In-flight tool operations (keep verbatim)
- Unresolved errors (keep verbatim until fixed)

---

### 6. Persist

Write pruning stats to `.codebase/TELEMETRY.jsonl` for pattern analysis.

**Entry format**:

```json
{"ts":"2026-06-10T14:32:00Z","event":"context-prune","session_id":"abc123","before_tokens":85000,"after_tokens":42000,"passes":{"dedup":12,"purge_errors":8,"compress":25},"protected":15,"summary_tokens":180}
```

**Why persist**: Over time, telemetry reveals which agents produce the most noise, which skills bloat context, and when pruning is most effective.

---

## Decision Matrix: Prune vs Compact vs Checkpoint

| Situation | Tokens | Action | Command |
|-----------|--------|--------|---------|
| Minor bloat, same task | 40-60% | Prune (3-pass) | Agent-triggered |
| Major bloat, same task | 60-80% | Compact + prune | Agent-triggered, then `/fd-checkpoint` |
| Task complete, new task next | Any | Checkpoint | `/fd-checkpoint` |
| Phase switch (plan → execute) | Any | Compact | Agent-triggered summary |
| Multi-wave plan, wave done | Any | Compact | `@orchestrator` summarizes wave |
| Session > 1 hour | Any | Checkpoint | `/fd-checkpoint` |
| Context > 80% | Any | Checkpoint immediately | `/fd-checkpoint` |

**Prune**: Remove noise, keep session alive.
**Compact**: Replace ranges with summaries, keep session alive.
**Checkpoint**: Save state, start fresh session.

---

## Anti-Patterns

### Do Not Prune Active User Instructions

The last 2 user messages are sacred. If they contain a multi-part instruction, keep all parts until the agent has addressed each one.

**Bad**: Prune turn 5 where the user said "also fix the test" because it is 10 turns back, while the agent is still working on the first part.

**Good**: Pin the instruction and unpin after confirmation.

### Do Not Duplicate Tool Results Across Agents

When `@parallel-coordinator` dispatches agents, each agent may read the same file. Do not carry all N copies forward.

**Bad**: 3 agents read `src/db.ts`; all 3 full file contents stay in context.

**Good**: Keep the first read. Subsequent agents reference it by citation.

### Do Not Compress Without Preserving Evidence Links

A summary without a link is a rumor. Always attach evidence.

**Bad**: "We decided on approach A."

**Good**: "Selected approach A (sliding-window expiry). See DECISIONS.jsonl:auth-refresh-2026-06-10."

---

## FlowDeck Tool Reference

| Tool / Command | Role in Context Steward |
|----------------|------------------------|
| `codegraph` | Find symbols without reading full files — reduces ingest size |
| `memory` | Query past decisions instead of loading full `DECISIONS.jsonl` |
| `decision-trace` | Record decisions before compressing the discussion that led to them |
| `/fd-checkpoint` | Full save + clear — use at 80% or task boundaries |
| `/fd-resume` | Load summarized context instead of full history |
| `load-rules` | Stage-gated rule loading — reduces ingest at session start |

---

## Cross-Reference

| Skill | Relationship |
|-------|-------------|
| [`context-budget`](context-budget/SKILL.md) | Sets thresholds and audit practices. Context Steward executes the pruning when those thresholds are breached. |
| [`session-persistence`](session-persistence/SKILL.md) | Defines what to save at session boundaries. Context Steward decides what to prune before that save happens. |
| [`strategic-compact`](strategic-compact/SKILL.md) | Advises on when to compact manually. Context Steward automates compaction as part of the prune pipeline. |
| [`context-guard`](context-guard/SKILL.md) | Defines boundary checks. Context Steward uses those boundaries to decide what is protected during pruning. |

---

## Quick Reference

```
Ingest  → Filter by stage → Prune (dedup → purge → compress)
            ↓                    ↓
        load-rules            Protect core / safety / intent / in-flight
            ↓                    ↓
        Skip irrelevant       Summarize pruned ranges
            ↓                    ↓
        rules/skills          Persist telemetry
```

**Protected always**: `AGENTS.md`, `STATE.md`, active `PLAN.md`, `.codebase/DECISIONS.jsonl`, `.codebase/FAILURES.json`, last 2 user messages, in-flight tool results.

**Prune first**: Duplicate reads, resolved errors, stale exploratory turns.

**Checkpoint when**: > 80% tokens, task complete, phase switch, session > 1 hour.
