---
description: Explore public APIs — writer drafts documentation — reviewer accuracy check — writer finalizes
argument-hint: [--scope=path | --format=api,guide,readme]
---

# Write Docs

Generate documentation for the codebase or a specific scope.

**Input:** $ARGUMENTS — optional `--scope=<path>` and `--format=<type>`

Supported formats: `api` (API reference), `guide` (usage guide), `readme` (README)  
Default: all formats

## Pipeline

### Phase 1 — Explore

- **@researcher**: Find all public APIs, exported functions, classes, types, and their signatures
- **@code-explorer**: Identify existing documentation, JSDoc comments, README sections

### Phase 2 — Draft

- **@writer**: Draft documentation based on the exploration findings
  - API docs: function signatures, parameters, return types, examples
  - Guides: usage examples, step-by-step instructions
  - README: project overview, install, quickstart, API summary

### Phase 3 — Review

- **@reviewer**: Check accuracy — verify all documented APIs exist and signatures are correct
  - Flag any documentation that contradicts the implementation
  - Flag missing documentation for public APIs

### Phase 4 — Finalize

- **@writer**: Apply reviewer corrections, finalize and write documentation files

## Output Files

Based on `--format`:
- `api` → writes or updates `docs/API.md`
- `guide` → writes or updates `docs/GUIDE.md`
- `readme` → updates `README.md`

If `--scope` is set, documentation applies only to files within that path.

## Completion

Report: files written/updated, public APIs documented, any gaps found.
