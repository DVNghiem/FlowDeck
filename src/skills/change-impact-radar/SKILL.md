---
name: change-impact-radar
description: Predict affected files, modules, APIs, tests, and DB paths before changes. Returns an impact map for human review.
origin: FlowDeck
---

# Change Impact Radar

Predicts blast surface before the AI touches a single file. Activate this skill by providing the intended change description to the agent.

## When to Activate

Activate before:
- Any multi-file refactor
- API contract changes
- Schema migrations
- Dependency upgrades
- Auth / security changes

## Workflow

1. Read `.codebase/ARCHITECTURE.md` and `.codebase/STACK.md` for system context
2. Read `.codebase/MEMORY.json` to trace the module dependency graph
3. From the change description, identify all directly affected files
4. Walk the dependency graph outward from affected files (depth ≤ 3 hops)
5. Identify test files that cover the affected modules
6. Flag any database schema, API contracts, or config changes
7. Produce the impact map report

## Impact Map Report Format

```markdown
## Change Impact Report

### Direct Impact (files you will edit)
| File | Type | Risk |
|------|------|------|

### Indirect Impact (dependents, ≤3 hops)
| File | Dependency Chain | Risk |
|------|-----------------|------|

### API Contracts at Risk
- [contract name]: [why at risk]

### Tests to Run / Update
- [test file]: covers [module]

### Database / Config paths
- [path]: [what changes]

### Volatility Warnings
- [file]: marked as [stability level]

### Verdict: LOW | MEDIUM | HIGH impact
```

## Guidance

- If MEMORY.json does not exist, run `/fd-map-codebase` first to build the graph.
- If a file has no test coverage and is indirectly impacted, flag it as "coverage gap".
- Never proceed with a HIGH impact change without human confirmation.
