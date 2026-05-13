---
name: context-load
description: Load full project context at session start. Read STATE.md, PLAN.md, PROJECT.md, CONVENTIONS.md, and ARCHITECTURE.md to brief any agent on where work stands.
origin: FlowDeck
---

# Context Load Skill

Gets any agent up to speed in under 30 seconds. Loads the minimum set of project files needed to understand what phase the work is in and what comes next.

## When to Activate

Activate at the start of every session, or when:
- Starting a new OpenCode session
- An agent seems unaware of the current project state
- You want to brief a new agent on the project

## Core Principles

- Load context before asking any agent to do work
- Read in dependency order: state first, then plan, then code conventions
- Surface blockers immediately — don't proceed if STATE.md shows a blocker

## Workflow

1. **Read STATE.md** — current phase, active plan, completed steps, blockers
2. **Read active PLAN.md** — (path from STATE.md) next tasks and success criteria
3. **Read .planning/PROJECT.md** — project name, stack, constraints
4. **Read .codebase/CONVENTIONS.md** — naming patterns, import style, error handling
5. **Read .codebase/ARCHITECTURE.md** — component layout and data flow

## Context Files

| File | Contains | Load Order |
|------|---------|-----------|
| `STATE.md` | Current phase, active plan, completed steps | 1st |
| `.planning/phases/phase-N/PLAN.md` | Tasks, success criteria | 2nd |
| `.planning/PROJECT.md` | Project context, constraints | 3rd |
| `.codebase/CONVENTIONS.md` | Naming, imports, patterns | 4th |
| `.codebase/ARCHITECTURE.md` | System design, components | 5th |

## Output Format

After loading context, produce this briefing:

```markdown
## Project Context Loaded

**Project**: [name from PROJECT.md]
**Phase**: [N] — [phase name]
**Status**: [discuss | plan | execute | review]
**Active Plan**: [path to PLAN.md]

**Completed Steps**: [N of M]
**Next Step**: [next incomplete step from PLAN.md]

**Blockers**: [none | description]

**Stack**: [from PROJECT.md or CONVENTIONS.md]
**Key Conventions**: [2-3 most important patterns]
```

If any file is missing, note it: "STATE.md not found — run `/fd-new-project` to initialize."
