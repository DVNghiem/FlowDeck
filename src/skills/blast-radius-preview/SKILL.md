---
name: blast-radius-preview
description: Show the likely downstream consequences of a proposed change — hidden dependencies, fragile integration points, and predicted breakage categories.
origin: FlowDeck
---

# Blast Radius Preview

Before committing to a change, map every system that could break. Activate this skill by providing a change description to the agent.

## When to Activate

- Before merging a change that touches shared infrastructure
- Before modifying a public API, event schema, or DB model
- Before changing authentication or session handling
- Any time the Impact Radar returns HIGH

## Workflow

1. Load the dependency graph from `.codebase/MEMORY.json`
2. Start from the directly changed nodes
3. Walk the graph outward: find all services/modules that depend on the changed node
4. At each hop, check:
   - Is this an integration point (API call, event subscription, DB query)?
   - Does this path have regression history in `.codebase/FAILURES.json`?
   - Is this path covered by integration tests?
5. Flag hidden couplings: shared mutable state, ambient context, feature flags
6. Produce the blast radius map

## Blast Radius Report Format

```markdown
## Blast Radius Report

### Change
[description]

### Direct Blast (depth 1)
| Module | Coupling Type | Test Coverage | Fragile? |
|--------|--------------|---------------|---------|

### Indirect Blast (depth 2–3)
| Module | Via | Risk Level |
|--------|-----|------------|

### Integration Point Risks
- [endpoint/event]: [why at risk]

### Hidden Couplings
- [module]: shared state / ambient context / feature flag

### Predicted Breakage Categories
- [ ] Performance: [reason]
- [ ] Auth: [reason]
- [ ] Schema: [reason]
- [ ] Async flow: [reason]

### Blast Radius: NARROW | MODERATE | WIDE
```

## Guidance

- NARROW: ≤3 downstream modules, all covered by tests → safe to proceed
- MODERATE: 4–10 downstream modules or ≥1 uncovered → add tests before merging
- WIDE: >10 downstream modules or hits fragile integration → escalate to senior review
