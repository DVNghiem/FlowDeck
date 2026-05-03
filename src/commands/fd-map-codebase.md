---
description: Analyze codebase and generate .codebase/ documentation — STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS
argument-hint: [--incremental]
---

# Map Codebase

Analyze the current codebase and generate comprehensive documentation under `.codebase/`.

**Input:** $ARGUMENTS (pass `--incremental` to only process changed files)

## Steps

1. Create `.codebase/` directory if it does not exist.

2. Run parallel analysis — delegate to specialist agents:
   - **@researcher**: Scan package files (`package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, etc.) to identify tech stack, frameworks, and dependencies
   - **@architect**: Analyze directory structure, module boundaries, key entry points, and architectural patterns
   - **@code-explorer**: Scan source files for naming conventions, code style patterns, import conventions, and anti-patterns
   - **@tester**: Find test files, identify testing frameworks, coverage configuration, and testing patterns
   - **@researcher** (second pass): Scan for TODO/FIXME/HACK comments, large files (>500 lines), duplicated code patterns, and security concerns

3. Write the following files based on analysis results:

   - **`.codebase/STACK.md`** — tech stack, frameworks, key dependencies with versions
   - **`.codebase/ARCHITECTURE.md`** — system design, module boundaries, key flows, data models
   - **`.codebase/STRUCTURE.md`** — directory layout with explanations of each major directory
   - **`.codebase/CONVENTIONS.md`** — naming rules, code style, import conventions, patterns to follow
   - **`.codebase/TESTING.md`** — test frameworks, test patterns, how to run tests, coverage targets
   - **`.codebase/CONCERNS.md`** — technical debt, risky areas, TODO clusters, large files, security flags

4. If `--incremental`: only update files where the underlying source has changed since the last map (check `.codebase/last_mapped` timestamp).

5. Write timestamp to `.codebase/last_mapped`.

6. Report summary: files created/updated, key findings per category.
