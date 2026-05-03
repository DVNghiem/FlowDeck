---
description: Ask a specialist agent a focused question — routes to architect, security, performance, or impact analyst
argument-hint: [question]
---

# Ask

Route a focused question to the most appropriate specialist agent.

**Input:** $ARGUMENTS — your question

## Routing

Analyze `$ARGUMENTS` to determine the best specialist:

| Keywords / Topic | Agent |
|-----------------|-------|
| design, architecture, structure, system, component, API | **@architect** |
| security, auth, vulnerability, token, permission, injection | **@security-auditor** |
| performance, speed, slow, optimize, latency, cache, memory | **@performance** |
| impact, change, affect, downstream, dependency, blast | **@researcher** (impact mode) |
| test, coverage, regression, tdd, gap | **@tester** |
| bug, error, crash, debug, trace | **@debug-specialist** |
| general / unclear | **@orchestrator** |

## Process

1. Identify the best specialist from the table above.
2. Delegate `$ARGUMENTS` to that specialist with full context:
   - Include `.codebase/ARCHITECTURE.md` if available and relevant
   - Include `.planning/STATE.md` phase context if relevant
3. Return the specialist's answer directly.

## Output

Present the answer clearly with:
- Which specialist answered
- The answer (no padding, no ceremony)
- Any follow-up suggestions if the question opens further threads
