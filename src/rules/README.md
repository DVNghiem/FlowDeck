# FlowDeck Rules

Coding standards for projects using FlowDeck. These define conventions that FlowDeck agents follow automatically.

## How It Works

Rules are loaded **automatically** by the FlowDeck plugin. No manual configuration is needed — when FlowDeck is installed, all rule files in this directory are injected into OpenCode's `instructions` at startup.

## Selective Rules (Optional)

If you want to override the default set and load only specific rules, add them to `opencode.json` under `instructions`:

```json
{
  "instructions": [
    "node_modules/@dv.nghiem/flowdeck/src/rules/common/coding-style.md",
    "node_modules/@dv.nghiem/flowdeck/src/rules/typescript/patterns.md"
  ]
}
```

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
