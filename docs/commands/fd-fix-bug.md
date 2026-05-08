---
description: Debug and fix a bug — scope analysis, mini-plan, implementation-agent fix, regression test, reviewer confirmation
argument-hint: "[bug description or issue number]"
---

Systematically debug and fix a bug using FlowDeck's structured approach.

**What this does:**
1. Reads `.codebase/` for architecture context
2. Delegates to `@debug-specialist` to locate the root cause
3. Creates a mini-plan (fix + regression test)
4. Delegates fix to `@backend-coder`, `@frontend-coder`, or `@devops` based on scope
5. Delegates regression test writing to `@tester`
6. Verifies the fix via `@reviewer`
7. Writes a brief post-mortem to `.planning/bugs/`

**Root cause first:** Does not implement a fix until root cause is confirmed — no symptom masking.

## What Next?

1. **Run code review** → `/fd-review-code`
2. **Check for more bugs** → `/fd-fix-bug [next-issue]`
3. **Update documentation** → `/fd-write-docs`
4. **Deploy check** → `/fd-deploy-check`
