# /fd-map-codebase

**Purpose:** Analyze and index the codebase into structured `.codebase/` documentation files.

## Usage

/fd-map-codebase [--incremental] [--force]

## Arguments

- `--incremental` — only update files where the underlying source has changed since the last mapping
- `--force` — skip the existing-index confirmation prompt and rebuild from scratch

## What Happens

### Pre-flight

1. Check codegraph installation using `codegraph action=check`.
2. Log the result: installed and indexed, installed but not indexed, or not installed.
3. Auto-install codegraph if missing (`codegraph action=install`).
4. Initialize or refresh the codegraph index (`codegraph action=init` or `codegraph action=refresh`).

### Process

1. Check if `.codebase/` documentation directory already exists. If it does and `--force` is not set, prompt for confirmation before overwriting.
2. Initialize 6 isolated worktrees for parallel mapper agents:
   - `flowdeck-mapper-stack`
   - `flowdeck-mapper-arch`
   - `flowdeck-mapper-structure`
   - `flowdeck-mapper-conventions`
   - `flowdeck-mapper-testing`
   - `flowdeck-mapper-concerns`
3. Spawn 6 `@mapper` agents in parallel, each producing one documentation file:
   - `@mapper` → `.codebase/STACK.md` — tech stack, dependencies, versions
   - `@mapper` → `.codebase/ARCHITECTURE.md` — system design, components, data flow
   - `@mapper` → `.codebase/STRUCTURE.md` — file organization, directory layout
   - `@mapper` → `.codebase/CONVENTIONS.md` — coding standards, naming, patterns
   - `@mapper` → `.codebase/TESTING.md` — test strategy, coverage, frameworks
   - `@mapper` → `.codebase/CONCERNS.md` — known issues, technical debt, risks

Each mapper uses codegraph MCP tools for symbol-level analysis, falling back to direct file reads when codegraph does not cover a specific detail.

### Cleanup

Remove all worktrees regardless of outcome after agents complete.

### Verify

Check that all 6 doc files exist and contain non-empty content.

### Finalize

1. Write timestamp to `.codebase/last_mapped`.
2. Update codegraph state with `codegraph action=status`.

## Output / State

Files created in `.codebase/`:
- `STACK.md` — technology stack and dependencies
- `ARCHITECTURE.md` — system architecture and component relationships
- `STRUCTURE.md` — directory layout and file organization
- `CONVENTIONS.md` — coding standards and patterns
- `TESTING.md` — test coverage and frameworks
- `CONCERNS.md` — technical debt and known risks
- `last_mapped` — timestamp file
- `CODEGRAPH.md` — codegraph index status

Report includes: codegraph install/index status, files created per mapper, key findings per category.

## Examples

**Full codebase mapping:**
```
/fd-map-codebase
```

**Incremental update (only changed files):**
```
/fd-map-codebase --incremental
```

**Force rebuild (skip confirmation):**
```
/fd-map-codebase --force
```

## Related Commands

- `/fd-new-feature` - Define a new feature, initialize feature context in the current phase directory
- `/fd-doctor` — check environment health including codegraph status
- `/fd-discuss` — uses codegraph for code intelligence during discussions
- `/fd-plan` — uses codegraph for impact analysis during planning
