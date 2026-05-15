---
description: Analyze codebase and generate .codebase/ documentation — STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS
argument-hint: [--incremental]
---

# Map Codebase

Analyze the current codebase and generate comprehensive documentation under `.codebase/`.

**Input:** $ARGUMENTS (pass `--incremental` to only process changed files)

## Pre-flight

Check if `.codebase/` directory already exists. If present, warn and require confirmation to overwrite.

## Process

### Step 1: Check Existing

If `.codebase/` directory already exists:
```
Warning: .codebase/ already exists. Running /fd-map-codebase will overwrite existing docs.
Continue? (y/n)
```
If user declines, abort. If user confirms, proceed.

### Step 2: Initialize Worktrees

D-04: Each mapper runs in its own isolated worktree to prevent conflicts.
Create worktrees:
- `flowdeck-mapper-stack`
- `flowdeck-mapper-arch`
- `flowdeck-mapper-structure`
- `flowdeck-mapper-conventions`
- `flowdeck-mapper-testing`
- `flowdeck-mapper-concerns`

### Step 3: Invoke Mappers

Spawn 6 @mapper agents in parallel:
- @mapper → STACK.md (tech stack, dependencies, versions)
- @mapper → ARCHITECTURE.md (system design, components, data flow)
- @mapper → STRUCTURE.md (file organization, directory layout)
- @mapper → CONVENTIONS.md (coding standards, naming, patterns)
- @mapper → TESTING.md (test strategy, coverage, frameworks)
- @mapper → CONCERNS.md (known issues, technical debt, risks)

Each mapper:
- Reads source files directly (no guessing)
- Outputs factual analysis only
- Writes to assigned .codebase/ doc file

### Step 4: Wait for Completion

Wait for all 6 mapper agents to complete. If any fails:
- Log the failure
- Continue with remaining mappers
- Report which docs were not generated

### Step 5: Cleanup

Remove all worktrees regardless of outcome (cleanup happens after all agents complete).

### Step 6: Verify

Check that all 6 .codebase/ doc files exist and contain non-empty content.
If any are missing or empty, report which ones need regeneration.

If `--incremental`: only update files where the underlying source has changed since the last map (check `.codebase/last_mapped` timestamp).

### Step 7: Write Timestamp

Write timestamp to `.codebase/last_mapped`.

## Output

Report summary: files created/updated, key findings per category.

## Error Handling

D-03: Fail fast with clear error
- If .codebase/ check fails: show clear error with remediation
- If worktree creation fails: report which worktree failed
- Do NOT save partial state on error
