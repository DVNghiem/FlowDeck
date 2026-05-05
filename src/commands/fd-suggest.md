---
description: Analyze codebase and suggest new features with implementation instructions
argument-hint: [--category=TYPE] [--limit=N]
---

# Suggest Features

Analyze the codebase and generate actionable feature suggestions with implementation guidance.

**Input:** $ARGUMENTS (optional --category for focus area: tools|hooks|agents|skills, --limit for number of suggestions, default 5)

## Process

### Step 1: Detect Environment

Check if `.planning/` directory exists:
- If it exists: Use current project context, analyze within existing architecture
- If not: This is a standalone analysis, scan the codebase root

### Step 2: Run Analysis Tools

Execute tools to gather insight data:

1. **Volatility Map** — `volatility-map` tool to find high-change areas (instability signals)
2. **Decision Trace** — `decision-trace` tool to find incomplete orTODO decisions
3. **Failure Replay** — `failure-replay` tool to find recurring failure patterns
4. **Codebase State** — `codebase-state` tool to get overall project structure

### Step 3: Scan for Gaps

Analyze the codebase structure to identify gaps:

- **Tools** — Are all tool categories covered? (planning, state, execution, analysis)
- **Hooks** — Are lifecycle hooks comprehensive?
- **Agents** — Are agent types sufficient for common tasks?
- **Skills** — Are there skill coverage gaps for major frameworks?

### Step 4: Generate Suggestions

For each valid suggestion (up to --limit), produce:

```
## Suggestion N: [Feature Name]

**Category:** tools|hooks|agents|skills  
**Impact:** HIGH|MEDIUM|LOW  
**Complexity:** HIGH|MEDIUM|LOW  

### Problem Statement
[What issue this solves, with evidence from analysis]

### Proposed Solution
[Brief description of the approach]

### Implementation Steps
1. [Step with TDD approach - write test first]
2. [Step referencing existing patterns]
3. [Step with integration points]

### Files Affected
- `src/tools/xxx.ts` or `src/hooks/xxx.ts` or `src/agents/xxx.ts`
- `src/skills/xxx/SKILL.md` (if applicable)
- `docs/xxx.md` (if applicable)

### Integration
- How this connects to existing FlowDeck tools/agents
- Any new dependencies or configuration needed
```

### Step 5: Rank and Present

Sort suggestions by impact/complexity ratio (highest first).

Present:
```
# Feature Suggestions

Found N suggestions ranked by impact:

[Suggestions 1-N]

---
Run /fd-discuss [topic] to start a discussion on any suggestion.
```
