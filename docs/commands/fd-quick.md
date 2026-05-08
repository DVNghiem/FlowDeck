---
description: Quick task execution — analyze, implement, review, or investigate a specific piece of work without the full discuss -> plan -> execute workflow
argument-hint: [task description]
---

# Quick Task

Execute a focused task without the full workflow. Analyzes the request, selects the best specialist agent, and returns the result directly.

## Agent Selection Matrix

| Task Type | Agent |
|-----------|-------|
| Backend code | @backend-coder |
| Frontend code | @frontend-coder |
| DevOps/infra code | @devops |
| Explore/understand | @code-explorer |
| Review code | @reviewer |
| Security review | @security-auditor |
| Design/architecture | @architect |
| Write tests | @tester |
| Documentation | @doc-updater |
| Research | @researcher |
| Debug | @debug-specialist |
| Performance | @performance-optimizer |
| Build error | @build-error-resolver |

## Examples

```
/fd-quick find where session validation happens
/fd-quick add rate limiting to the API
```

**Note:** Use for small tasks only (~15 min). For larger work, use `/fd-new-feature`.