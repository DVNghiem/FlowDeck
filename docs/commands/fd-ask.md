---
description: Smart dispatch — routes a free-form task to the appropriate specialized agent without requiring a workflow
argument-hint: "--task '<description>'"
---

Route a free-form task to the best specialized agent automatically.

**What this does:**
1. Parses your task description using keyword scoring
2. Picks the best-fit agent from 12 specialists
3. Runs the Impact Radar if the task involves change analysis
4. Dispatches the task directly — no workflow, no STATE.md required

**Routing table:**

| Keywords | Agent |
|---|---|
| design, architecture, component | `@architect` |
| impact, blast radius, affected | `@researcher` + radar |
| security, vulnerability, CVE | `@security-auditor` |
| performance, bottleneck, slow | `@performance-optimizer` |
| debug, error, crash, exception | `@debug-specialist` |
| test, coverage, spec, TDD | `@tester` |
| refactor, cleanup, simplify | `@backend-coder` / `@frontend-coder` / `@devops` |
| document, docs, README | `@writer` |
| explain, query, find, explore | `@code-explorer` |
| deploy, release, migration | `@devops` |
| plan, roadmap, breakdown | `@planner` |
| (anything else) | `@orchestrator` |

**Examples:**

```
/fd-ask --task "system design for a real-time notification service"
/fd-ask --task "explain how the payment flow works"
/fd-ask --task "is there a security issue with the rate limiter"
/fd-ask --task "why is the login endpoint slow"
/fd-ask --task "what files are affected if I change the auth module"
/fd-ask --task "write tests for the checkout service"
/fd-ask --agent security-auditor --task "review the JWT implementation"
```

**Override routing:** Use `--agent` to force a specific agent.

## What Next?

After `/fd-ask` completes, you can go deeper:

1. **Full workflow** → `/fd-fix-bug`, `/fd-new-feature`, `/fd-review-code`
2. **Detailed planning** → `/fd-discuss`, `/fd-plan`
3. **Another question** → `/fd-ask --task '...'`
