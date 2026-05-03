---
description: Blast Radius Preview — show downstream consequences of a proposed change including hidden dependencies and fragile integration points
argument-hint: [change description] [--depth=N]
---

# Blast Radius

Map the full downstream blast radius of a proposed change.

**Input:** $ARGUMENTS — description or file path of the proposed change. Optional `--depth=N` (default: 3).

## Steps

Run two agents in parallel:

- **@architect**: Trace dependency graph to depth `--depth` (default 3 levels); flag integration points, event listeners, shared state, and service-to-service calls that would be affected

- **@researcher**: Identify hidden couplings — shared config values, environment variables, database tables, message queue topics, and implicit conventions that the changed code relies on

## Report

```
════════════════════════════════════════════
BLAST RADIUS PREVIEW
════════════════════════════════════════════
Change: <summary>
Depth: <N> levels

Direct Impact (depth 1):
  - <file/module> — <relationship>

Indirect Impact (depth 2-3):
  - <file/module> — <chain>

Hidden Couplings:
  - <coupling type>: <description>

Fragile Integration Points:
  - <point> — <why fragile>

Risk Assessment:
  Score: <0-10>
  Level: <low|medium|high|critical>
  
  <1-2 sentence summary of the biggest risks>

Recommended: <proceed | add tests | get review | redesign>
════════════════════════════════════════════
```
