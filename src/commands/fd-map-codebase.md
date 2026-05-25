---
description: Analyze codebase and generate .codebase/ documentation — STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS. Uses codegraph as primary code intelligence layer.
argument-hint: [--incremental] [--force]
---

# Map Codebase

Analyze the current codebase and generate comprehensive documentation under `.codebase/`.
Uses `codegraph` as the primary code intelligence layer for accurate, symbol-level understanding.

**Input:** $ARGUMENTS (pass `--incremental` to only update changed files, `--force` to skip existing-index confirmation)

## Pre-flight

### Step 0: Check codegraph Installation

Use the `codegraph` tool to check the current state:

```
codegraph action=check
```

Log the result:
- **If installed and indexed**: "codegraph ready — index is [fresh/stale]"
- **If installed but not indexed**: "codegraph installed, index not built — will initialize"
- **If not installed**: "codegraph not installed — will auto-install"

### Step 1: Auto-Install codegraph if Missing

If `codegraph` is not installed:

```
codegraph action=install
```

Log clearly:
- If install succeeded: "codegraph installed successfully"
- If already installed (skipped): "codegraph already installed — skipping"
- If install failed: report the error and remediation steps; abort

> **Diagnostics**: Log install output verbatim for troubleshooting.

### Step 2: Initialize or Refresh codegraph Index

If `.codegraph/` does not exist or `--force` was passed:

```
codegraph action=init agent=fd-map-codebase
```

If `.codegraph/` exists and `--incremental` was passed:
- Check if changed since last index
- If stale: run `codegraph action=refresh agent=fd-map-codebase`
- If fresh: log "codegraph index is fresh — reusing existing mapping"

Log:
- Whether this was a full build or incremental update
- Number of changed files detected
- The git revision fingerprinted

If init/refresh fails:
- Log the error and diagnostic output
- Fall back to mapper agents only (proceed to Step 3 without codegraph)
- Note in summary that codegraph was unavailable

### Step 3: Check Existing .codebase/ Docs

Check if `.codebase/` documentation directory already exists.

If present and `--force` is not set:
```
Warning: .codebase/ already exists. Running /fd-map-codebase will overwrite existing docs.
Continue? (y/n)
```
If user declines, abort. If user confirms or `--force` was passed, proceed.

## Process

### Step 4: Initialize Worktrees

D-04: Each mapper runs in its own isolated worktree to prevent conflicts.
Create worktrees:
- `flowdeck-mapper-stack`
- `flowdeck-mapper-arch`
- `flowdeck-mapper-structure`
- `flowdeck-mapper-conventions`
- `flowdeck-mapper-testing`
- `flowdeck-mapper-concerns`

### Step 5: Invoke Mappers with codegraph Context

Spawn 6 @mapper agents in parallel. Each mapper receives the codegraph status:

- @mapper → STACK.md (tech stack, dependencies, versions)
- @mapper → ARCHITECTURE.md (system design, components, data flow)
- @mapper → STRUCTURE.md (file organization, directory layout)
- @mapper → CONVENTIONS.md (coding standards, naming, patterns)
- @mapper → TESTING.md (test strategy, coverage, frameworks)
- @mapper → CONCERNS.md (known issues, technical debt, risks)

**codegraph instructions for mappers:**

If `.codegraph/` exists, each mapper **must** use codegraph MCP tools first:

| Task | Tool |
|------|------|
| Map a module / feature area | `codegraph_context` |
| Find a symbol by name | `codegraph_search` |
| Trace call paths | `codegraph_trace` |
| Check callers/callees | `codegraph_callers` / `codegraph_callees` |
| Impact of a change | `codegraph_impact` |
| Read a symbol's source | `codegraph_node` |
| Survey related symbols | `codegraph_explore` |

Fall back to direct file reads only when codegraph doesn't cover a specific detail.

Each mapper:
- Reads from codegraph first, files only when necessary
- Outputs factual analysis only
- Writes to assigned .codebase/ doc file

### Step 6: Wait for Completion

Wait for all 6 mapper agents to complete. If any fails:
- Log the failure
- Continue with remaining mappers
- Report which docs were not generated

### Step 7: Cleanup

Remove all worktrees regardless of outcome (cleanup happens after all agents complete).

### Step 8: Verify

Check that all 6 .codebase/ doc files exist and contain non-empty content.
If any are missing or empty, report which ones need regeneration.

If `--incremental`: only update files where the underlying source has changed since the last map (check `.codebase/CODEGRAPH.md` lastIndexedAt timestamp).

### Step 9: Write Timestamp and Update State

1. Write timestamp to `.codebase/last_mapped`.
2. Update the `codegraph` tool state:
   ```
   codegraph action=status
   ```
   Log whether codegraph MCP tools are available for subsequent commands.

## Output

Report summary:
- codegraph: installed ✅/❌, indexed ✅/❌, full/incremental build
- files created/updated per mapper agent
- key findings per category
- Next: codegraph MCP tools are now available to /fd-discuss, /fd-plan, /fd-execute, /fd-fix-bug

## Error Handling

D-03: Fail fast with clear error
- If codegraph install fails: log diagnostics, fall back to mapper-only mode (no codegraph MCP)
- If codegraph init fails: log diagnostics, fall back to mapper-only mode
- If .codebase/ check fails: show clear error with remediation
- If worktree creation fails: report which worktree failed
- Do NOT save partial state on error
