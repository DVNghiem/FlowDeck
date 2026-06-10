---
name: context-budget
description: Optimize token usage and context window discipline. Reduce costs and improve response quality through smart context management.
origin: FlowDeck
---

# Context Budget Skill

Treat context window as a finite resource. Every token loaded — files, rules, tool outputs, conversation history — consumes budget. Optimizing context improves speed, cuts costs, and prevents mid-session truncation.

## When to Activate

Activate when:
- A session exceeds 50K tokens or feels sluggish
- You are about to load large files, MCP tools, or heavy rulesets
- You want to audit and slim down your FlowDeck setup
- You are designing new skills, agents, or workflows

## Core Principles

- **Load less, get more** — context quality beats context quantity
- **Measure before optimizing** — know your current burn rate
- **Batch over chat** — accumulate work, run checks once
- **Right-size the model** — light tasks do not need the strongest model

## Why Context Budget Matters

| Factor | Impact |
|--------|--------|
| Context window limit | Hard cap — exceed it and early conversation is lost |
| Cost per token | More context = more input tokens = higher bill |
| Response latency | Large context increases time-to-first-token |
| Attention degradation | Models perform worse on content near the middle of long context |

### Hard Limits (Examples)

| Model | Context Window |
|-------|---------------|
| Claude 3.5 Haiku | 200K tokens |
| Claude 3.5 Sonnet | 200K tokens |
| GPT-4o | 128K tokens |
| GPT-4o mini | 128K tokens |

Treat 80% of the window as your practical maximum. Beyond that, truncation risk rises sharply.

## Skill Size Audit

Oversized skills waste context on every activation. Audit yours regularly.

### Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Lines per SKILL.md | > 300 | > 400 |
| Words in description | > 25 | > 30 |
| Files loaded per task | > 5 | > 10 |
| Rules active at once | > 8 | > 12 |

### How to Audit

```bash
# Count lines in all skills
find src/skills -name "SKILL.md" -exec wc -l {} + | sort -n

# Flag skills over 300 lines
find src/skills -name "SKILL.md" -exec sh -c 'lines=$(wc -l < "$1"); [ "$lines" -gt 300 ] && echo "$lines $1"' _ {} \;

# Check description word counts
grep -r "^description:" src/skills/ | awk '{print NF, $0}' | sort -n
```

### Remediation

- **Split oversized skills** — extract sub-topics into separate skills
- **Shorten descriptions** — under 25 words is ideal; under 30 is required
- **Use stage-gated rules** — load heavy rules only in `execute` or `verify` stages
- **Defer heavy context** — load `.codebase/ARCHITECTURE.md` only when needed

## Model Routing Strategy

Not every task needs the strongest model. Route by complexity.

| Task Type | Example | Model Tier |
|-----------|---------|-----------|
| Simple edit | Fix typo, rename variable | Fast / Small |
| Code review | Lint, style check | Fast / Small |
| Research | Look up API docs | Fast / Small |
| Feature implementation | Multi-file change | Strong / Large |
| Debug | Root cause analysis | Strong / Large |
| Architecture design | New module design | Strong / Large |

### FlowDeck Agent Routing

FlowDeck already routes by task class:
- `quick` workflow → `@default-executor` (lightweight)
- `standard` workflow → specialist agents (medium)
- `verify-heavy` or `explore` → strongest models (heavy)

Respect this routing. Do not escalate a `quick` task to a heavy agent.

## Prefer CLI Tools Over MCPs

MCP servers add context overhead: schema discovery, tool definitions, and response envelopes. Native CLI tools are leaner.

| Use Case | Heavy MCP | Lean Alternative |
|----------|-----------|-----------------|
| Git operations | GitHub MCP | `git`, `gh` CLI |
| AWS queries | AWS MCP | `aws` CLI |
| Kubernetes checks | K8s MCP | `kubectl` |
| File search | File-system MCP | `find`, `rg` |
| Database query | DB MCP | `psql`, `mysql` CLI |

### When MCPs Are Worth It

- Complex multi-step operations (e.g., create PR + add reviewers + set labels)
- Operations requiring authentication tokens you do not have locally
- Structured data return that CLI would require parsing

## Accumulator + Batch Pattern

Chatty sessions burn context fast. Accumulate edits, then run checks once.

### Anti-Pattern: Chatty Loop

```
Edit file A → run test → fix error → edit file B → run test → fix error → edit file C → run test
```

Each test run consumes output tokens. Three runs = 3x test output in context.

### Preferred: Batch + Single Check

```
Edit file A
Edit file B
Edit file C
Run tests once
Fix all errors
```

### In FlowDeck

Use `/fd-checkpoint` after a batch of edits, then `/fd-resume` to continue. This preserves your work without carrying full error output forward indefinitely.

## Strategic Context Clearing

Long sessions accumulate noise: failed attempts, dead-ends, large tool outputs. Clear context before it degrades quality.

### When to Checkpoint

| Signal | Action |
|--------|--------|
| Session > 1 hour | `/fd-checkpoint` |
| Tokens > 50K | `/fd-checkpoint` |
| Multiple failed attempts | `/fd-checkpoint` and reassess |
| Task complete, new task next | `/fd-checkpoint` |

### Resume Pattern

```
1. `/fd-checkpoint` — save current state to STATE.md
2. Start fresh session
3. `/fd-resume` — load STATE.md, PLAN.md, active context
4. Continue with clean context
```

This is cheaper than carrying 80K tokens of conversation history.

## Rule Loading Optimization

FlowDeck uses stage-gated rules. Only rules matching the current stage are loaded.

| Stage | Typical Rules Loaded |
|-------|---------------------|
| `discuss` | Behavioral, lightweight |
| `plan` | Planning, architecture |
| `execute` | Coding standards, language patterns, security |
| `verify` | Testing, security, linting |
| `fix-bug` | Debug, testing |

### Keep Rules Focused

- One concern per rule file
- Use `stages` array to gate loading
- Set `always_on: false` for heavy rules
- Keep rules under 150 lines when possible

Audit with:

```bash
# Find rules loaded in every stage (always_on = true)
grep -r "always_on: true" src/rules/

# Find oversized rules
find src/rules -name "*.md" -exec sh -c 'lines=$(wc -l < "$1"); [ "$lines" -gt 200 ] && echo "$lines $1"' _ {} \;
```

## Code Modularity Benefits

Smaller files = less context per task. A 400-line file forces the model to hold the entire file in working memory. Four 100-line files let the model focus on one at a time.

| File Size | Context Impact |
|-----------|---------------|
| < 200 lines | Minimal — load on demand |
| 200-400 lines | Moderate — acceptable for core files |
| 400-800 lines | Heavy — consider splitting |
| > 800 lines | Critical — split immediately |

### Splitting Guidance

- One responsibility per file
- Extract utilities to `utils/` or `helpers/`
- Extract types to `types.ts`
- Use `codegraph` to find natural split points: `codegraph_impact` on a large symbol reveals which parts are independent

## Self-Audit Checklist

Run this monthly or when context feels heavy:

### Skills
- [ ] No SKILL.md exceeds 400 lines
- [ ] No skill description exceeds 30 words
- [ ] Unused skills removed from `.opencode/skills/`

### Rules
- [ ] No rule file exceeds 200 lines
- [ ] Heavy rules are stage-gated (`always_on: false`)
- [ ] No redundant rules (same topic, different files)

### Workflows
- [ ] Tasks are batched before verification runs
- [ ] `/fd-checkpoint` used at natural boundaries
- [ ] Model routing respects task complexity

### Codebase
- [ ] No source file exceeds 800 lines
- [ ] Core modules are under 400 lines
- [ ] Large files have clear split candidates via `codegraph`

### Session Hygiene
- [ ] MCP tools used only when CLI is insufficient
- [ ] Large outputs (logs, diffs) are summarized, not pasted raw
- [ ] Failed attempts are checkpointed, not retried endlessly

## Quick Wins

1. **Truncate diffs** — `git diff | head -50` instead of full diff
2. **Summarize logs** — `tail -20` instead of full log file
3. **Use `codegraph_search`** — find symbols without reading entire files
4. **Load rules on demand** — `load-rules` instead of pre-loading everything
5. **Split before you grow** — when a file hits 400 lines, plan the split

## Related Skills

- [`plan-task`](./plan-task/SKILL.md) — break work into right-sized chunks
- [`performance-profiling`](./performance-profiling/SKILL.md) — measure before optimizing
- [`context-load`](./context-load/SKILL.md) — load only the context you need

## References

- `/fd-checkpoint` — save session state, clear context
- `/fd-resume` — restore from checkpoint
- `load-rules` — stage-gated rule loading
- `codegraph` — symbol search without full-file reads
- `codegraph_impact` — find split points in large files
- `codegraph_search` — locate symbols efficiently
