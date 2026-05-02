# FlowDeck Rules

Coding standards for projects using FlowDeck. These define conventions that FlowDeck agents follow automatically.

## How to Use

Add a rule file to `opencode.json` under `instructions`:

```json
{
  "instructions": [
    ".flowdeck/rules/common/coding-style.md",
    ".flowdeck/rules/common/security.md",
    ".flowdeck/rules/typescript/patterns.md"
  ]
}
```

Agents will read these files and follow the conventions defined in them.

## Available Rules

### Common Rules (language-agnostic)

| File | Description |
|------|-------------|
| `common/agent-orchestration.md` | When to use each FlowDeck agent and parallel execution patterns |
| `common/coding-style.md` | Immutability, KISS/DRY/YAGNI, file organization, error handling, naming |
| `common/testing.md` | TDD workflow, coverage thresholds, test types, AAA pattern |
| `common/security.md` | Pre-commit security checklist, secret management, OWASP Top 10 |
| `common/git-workflow.md` | Conventional commits, branch naming, PR workflow, rebase vs merge |

### TypeScript Rules

| File | Description |
|------|-------------|
| `typescript/patterns.md` | API response format, custom hooks, repository pattern, Result types |
