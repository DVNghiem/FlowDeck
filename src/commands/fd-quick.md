---
description: Quick task execution — analyze, implement, review, or investigate a specific piece of work without the full discuss -> plan -> execute workflow
argument-hint: [task description]
---

# Quick Task

Execute a focused task without the full workflow. Analyzes the request, selects the best specialist agent, and returns the result directly.

**Input:** $ARGUMENTS — what you need done

## Analysis

Parse `$ARGUMENTS` to determine:

1. **Type of task** — what kind of work is it?
2. **Scope** — single file, directory, or whole codebase?
3. **Required capability** — what must the agent be able to do?

## Agent Selection Matrix

| Task Type | Signal Keywords | Agent |
|-----------|-----------------|-------|
| Write or edit code | implement, add, create, fix, refactor, update | `@coder` |
| Explore and understand | trace, map, find, explore, understand, what does | `@code-explorer` |
| Review code quality | review, check, audit, analyze | `@reviewer` |
| Security review | security, auth, vulnerability, injection, OWASP | `@security-auditor` |
| UI design-first planning | landing page, dashboard, admin panel, onboarding UX, app screen, wireframe, design system | `@design` |
| Design or architecture | design, architect, schema, API, structure | `@architect` |
| Write tests | test, coverage, regression, TDD | `@tester` |
| Documentation | docs, README, document, write | `@writer` |
| Research | research, find, look up, how to use, compare | `@researcher` |
| Debug | debug, trace, root cause, why is, fix error | `@debug-specialist` |
| Performance | performance, slow, optimize, bottleneck | `@performance-optimizer` |
| Build error | build error, compile, types, missing import | `@build-error-resolver` |
| Refactoring | refactor, extract, rename, restructure | `@refactor-guide` |
| Write/update docs | document, write docs, update README | `@doc-updater` |

**Default:** If unclear or mixed, use `@orchestrator`.

## Execution

1. Select the best agent from the matrix above.
2. Construct a focused prompt with:
   - The task from `$ARGUMENTS`
   - Relevant context (file paths, architecture info, existing code)
   - Clear success criteria
3. Execute directly — no intermediate steps.

## Output

Return the agent's output with:
- Which agent was used
- The result (be direct, no padding)
- If the task is partial or incomplete, note what still needs doing

## Guardrails

- **Small tasks only** — if the task would require more than ~15 minutes of work, suggest `/fd-new-feature` instead.
- **Single scope** — do not attempt multi-file refactors or cross-repo changes via this command.
- **No workflow overhead** — skip STATE.md updates, phase transitions, and plan markers.