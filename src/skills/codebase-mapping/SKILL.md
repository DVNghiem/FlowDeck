---
name: codebase-mapping
description: Systematic codebase exploration and documentation for agent context. Maps architecture, conventions, and file structure into .codebase/ files. Use when onboarding to a new project or before deep feature work.
origin: FlowDeck
---

# Codebase Mapping Skill

Produces structured documentation of a codebase that agents can read to answer "how does this project work?" without re-scanning every time.

## When to Activate

- Starting work on an unfamiliar codebase
- Before a major feature that spans multiple modules
- When `/map-codebase` command is invoked
- When `.codebase/` is missing or stale

## Output Files

All outputs go to `.codebase/`:

| File | Contents |
|------|----------|
| `ARCHITECTURE.md` | System design: layers, modules, data flow |
| `CONVENTIONS.md` | Naming, style, patterns specific to this project |
| `DEPENDENCIES.md` | Key external packages and what they do |
| `INDEX.md` | File-by-file inventory |
| `ENTRY_POINTS.md` | How the application starts and key entry files |

## Mapping Sequence

### Step 1: Start from the outside

Read in this order:
1. `package.json` / `pyproject.toml` / `Cargo.toml` — dependencies, scripts, metadata
2. `README.md` — stated purpose and architecture
3. Entry point files (main, index, app, server)
4. Configuration files (env examples, config schemas)

### Step 2: Map the directory structure

Document each top-level directory's purpose:
```
src/
  api/          — HTTP route handlers
  services/     — Business logic
  models/       — Database schemas and queries
  utils/        — Shared helpers
tests/          — Test files (mirror of src/)
scripts/        — Build and deployment scripts
```

Do not guess. Read the files to confirm what each directory contains.

### Step 3: Document key conventions

Find examples in the code:
- How are errors handled? (throw? return Result? error callback?)
- How are modules exported? (default export? named exports?)
- What is the naming pattern for files? (`UserService.ts`? `user-service.ts`?)
- Where do interfaces/types live?
- How is dependency injection done?

Write 1-2 examples for each pattern, not a generic description.

### Step 4: Document entry points

```markdown
## Entry Points

- `src/index.ts` — Application bootstrap, registers routes and middleware
- `src/workers/queue.ts` — Background job processor, runs independently
- `scripts/migrate.ts` — Database migration runner
```

### Step 5: List key dependencies

For each significant dependency, document:
- What it is used for in this project
- Where in the codebase it is used
- Version (note if pinned due to known issues)

## Accuracy rules

- Only document what you have read — never document by assumption
- If a file's purpose is unclear, note "purpose unclear — investigate before modifying"
- Timestamp the mapping: `Last updated: [date]`
