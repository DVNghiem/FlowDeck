# Language Rules

FlowDeck agents follow coding standards defined in `src/rules/`. Rules are loaded automatically at startup — no manual configuration required. They are injected into OpenCode's instructions as language-agnostic and language-specific guidance.

## Rule Precedence

When guidance conflicts, FlowDeck resolves precedence in this order:

1. Repository governance files (`AGENTS.md`, `CLAUDE.md`)
2. FlowDeck plugin rules from `src/rules/**`
3. Runtime policies from `.codebase/POLICIES.json`

## Common Rules (All Languages)

Language-agnostic rules are in `src/rules/common/`:

| File | Description |
|------|-------------|
| `common/agent-orchestration.md` | When to use each FlowDeck agent and parallel execution patterns |
| `common/coding-style.md` | Immutability, KISS/DRY/YAGNI, file organization, error handling, naming |
| `common/testing.md` | TDD workflow, coverage thresholds, test types, AAA pattern |
| `common/security.md` | Pre-commit security checklist, secret management, OWASP Top 10 |
| `common/git-workflow.md` | Conventional commits, branch naming, PR workflow, rebase vs merge |
| `common/behavioral.md` | Agent behavioral expectations and interaction patterns |

---

## TypeScript / JavaScript

**Location:** `src/rules/typescript/`

**Framework conventions:** API response format, custom hooks, repository pattern, Result types.

| File | Description |
|------|-------------|
| `typescript/patterns.md` | TypeScript API response format, custom hooks, repository pattern, Result types |

FlowDeck TypeScript rules apply to all `.ts` and `.tsx` files in your project.

---

## Python

**Location:** `src/rules/python/`

**Framework conventions:** Pythonic patterns, typing, async conventions.

| File | Description |
|------|-------------|
| `python/patterns.md` | Pythonic API design, typing, async patterns |

FlowDeck Python rules apply to all `.py` files in your project.

---

## Go

**Location:** `src/rules/golang/`

**Framework conventions:** Go idiom conventions, error handling, concurrency patterns.

| File | Description |
|------|-------------|
| `golang/patterns.md` | Go idioms, error wrapping, goroutine patterns, module layout |

FlowDeck Go rules apply to all `.go` files in your project.

---

## Rust

**Location:** `src/rules/rust/`

**Framework conventions:** Rust idiom conventions, ownership, lifetimes, Result types.

| File | Description |
|------|-------------|
| `rust/patterns.md` | Rust idioms, ownership model, error handling with `Result`, lifetime annotations |

FlowDeck Rust rules apply to all `.rs` files in your project.

---

## Java

**Location:** `src/rules/java/`

**Framework conventions:** Java idiom conventions, OOP patterns, exception handling.

| File | Description |
|------|-------------|
| `java/patterns.md` | Java idioms, OOP conventions, exception handling, package layout |

FlowDeck Java rules apply to all `.java` files in your project.

---

## Overriding Default Rules

To load only specific rules, add them to the `instructions` array in `opencode.json`:

```json
{
  "instructions": [
    "node_modules/@dv.nghiem/flowdeck/src/rules/common/coding-style.md",
    "node_modules/@dv.nghiem/flowdeck/src/rules/typescript/patterns.md"
  ]
}
```
