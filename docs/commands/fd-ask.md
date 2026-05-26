# /fd-ask

**Purpose:** Smart agent dispatch — routes a focused question to the appropriate specialist.

## Usage

/fd-ask [question]

## Arguments

- `question` — the question to route to a specialist agent

## What Happens

Analyze the question to determine the best specialist from this routing table:

| Keywords / Topic | Agent |
|-----------------|-------|
| ui, ux, wireframe, landing page, dashboard, admin panel, app screen, design system | **@design** |
| design, architecture, structure, system, component, API | **@architect** |
| security, auth, vulnerability, token, permission, injection | **@security-auditor** |
| performance, speed, slow, optimize, latency, cache, memory | **@performance** |
| impact, change, affect, downstream, dependency, blast | **@researcher** (impact mode) |
| test, coverage, regression, tdd, gap | **@tester** |
| bug, error, crash, debug, trace | **@debug-specialist** |
| general / unclear | **@orchestrator** |

Once the specialist is identified:
1. Delegate the question to that specialist with full context
2. Include `.codebase/ARCHITECTURE.md` if available and relevant
3. Include `.planning/STATE.md` phase context if relevant
4. Return the specialist's answer directly

## Output / State

Present the answer clearly with:
- Which specialist answered
- The answer (no padding, no ceremony)
- Any follow-up suggestions if the question opens further threads

## Examples

**Ask an architecture question:**
```
/fd-ask "What is the best way to structure a new API endpoint?"
```
Routes to: @architect

**Ask a security question:**
```
/fd-ask "How should we handle token expiration securely?"
```
Routes to: @security-auditor

**Ask about performance:**
```
/fd-ask "Why is the login page slow on mobile?"
```
Routes to: @performance

**Ask about a bug:**
```
/fd-ask "Why does the session timeout error appear randomly?"
```
Routes to: @debug-specialist

**Ask about test coverage:**
```
/fd-ask "What parts of the auth module are not tested?"
```
Routes to: @tester

**Ask about UI design:**
```
/fd-ask "Should the dashboard use tabs or a sidebar for navigation?"
```
Routes to: @design

## Related Commands

- `/fd-discuss` — structured exploration of a topic with multiple questions
- `/fd-suggest` — get feature recommendations
- `/fd-translate-intent` — convert a vague request into concrete options