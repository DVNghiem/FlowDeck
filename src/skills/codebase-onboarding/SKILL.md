---
name: codebase-onboarding
description: Explore and document an unfamiliar codebase. Use when joining a new project or generating project documentation.
origin: FlowDeck
---

# Codebase Onboarding Skill

Systematically maps an unfamiliar codebase into structured documentation. Factual only — no speculation.

## When to Activate

Activate when:
- Joining a new project for the first time
- A new AI agent needs to understand the codebase
- Project documentation is out of date or missing
- Before making major architectural changes

## Core Principles

- **Reconnaissance before action** — fully understand before touching anything
- **Factual, not speculative** — if uncertain, write `UNKNOWN — needs verification`
- **Document as you explore** — write findings immediately, before moving on

## Phase 1: Reconnaissance

```bash
# 1. Top-level structure
ls -la

# 2. Package manifest
cat package.json     # Node.js
cat go.mod           # Go
cat Cargo.toml       # Rust
cat requirements.txt # Python

# 3. Entry points
find . -name "index.*" -o -name "main.*" | grep -v node_modules | grep -v dist | grep -v .git

# 4. Directory structure
find . -maxdepth 2 -type d | grep -v node_modules | grep -v .git | grep -v dist

# 5. Test structure
find . -name "*.test.*" -o -name "*.spec.*" | grep -v node_modules | head -20
```

Findings:
- What framework is this? (Express, Next.js, FastAPI, etc.)
- Where does execution start?
- Where are the tests?

## Phase 2: Architecture Mapping

Read the most important files:
1. Main entry point — understand startup sequence
2. Route definitions — what APIs/endpoints exist?
3. Core data models — what are the key entities?
4. Database setup — what database, what ORM?
5. Auth setup — how is authentication handled?

Produce a component diagram:

```
Client
  → HTTP (port 3000)
  → Express Router (src/routes/)
  → Services (src/services/)
  → Repository (src/db/)
  → PostgreSQL
```

## Phase 3: Convention Detection

Read 5-10 source files and note patterns:

```bash
# Naming conventions
grep -n "export function\|export const\|export class" src/ -r | head -20

# Error handling
grep -n "catch\|throw\|Error(" src/ -r | head -20

# Async patterns
grep -n "async\|await\|Promise" src/ -r | head -20
```

Conventions to identify:
- Variable naming: camelCase, snake_case, or mixed?
- Import style: relative paths, aliases, or barrel exports?
- Error handling: throw, return Result, or callback?
- Async pattern: async/await, promises, or callbacks?

## Output Format

```markdown
# Codebase Onboarding: [Project Name]

## Phase 1: Reconnaissance

**Runtime**: Node.js v20 / Python 3.11 / Go 1.21
**Framework**: Express 4.18 / FastAPI / Echo
**Package manager**: npm / pip / cargo
**Entry point**: `src/index.ts:1`
**Test framework**: vitest / pytest / go test

## Phase 2: Architecture

**Pattern**: Layered (Routes → Services → Repository → Database)
**Database**: PostgreSQL via Prisma ORM
**Auth**: JWT via `src/middleware/auth.ts`

**Component Diagram**:
```
[diagram]
```

**Key Files**:
| File | Purpose |
|------|---------|
| `src/index.ts` | HTTP server startup |
| `src/routes/` | Route definitions |
| `src/services/` | Business logic |

## Phase 3: Conventions

**Naming**: camelCase for variables, PascalCase for types
**Imports**: relative paths within module, `@/` alias for cross-module
**Error handling**: throws `AppError` with code, caught by middleware
**Async**: async/await throughout

## Unknown / Needs Investigation
- [Things you could not determine from reading the code]
```
