---
name: map-codebase-flow
description: "Orchestrates codebase mapping (parallel mappers → wait for all → synthesize → write .codebase/ docs)"
triggers:
  - /map-codebase
steps:
  - name: check_existing
    agent: "@orchestrator"
    priority: first
    action: Check if .codebase/ already exists; warn and require confirmation if present
  - name: initialize_worktrees
    agent: "@orchestrator"
    action: Create individual worktrees for each mapper agent (one per doc: STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS)
  - name: invoke_mappers
    agent: "@mapper"
    action: Spawn 6 @mapper agents in parallel, each writing to its assigned doc file
  - name: wait_for_mappers
    agent: "@orchestrator"
    action: Wait for all mapper agents to complete
  - name: cleanup_worktrees
    agent: "@orchestrator"
    action: Remove worktrees after all mappers complete (success or error)
  - name: verify_output
    agent: "@orchestrator"
    action: Verify all 6 .codebase/ doc files exist and contain non-empty content
---

# Map Codebase Flow

## Purpose

Maps an existing codebase to documentation via parallel analysis. Produces STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md in `.codebase/`.

## Process

### Step 1: Check Existing

If `.codebase/` directory already exists:
```
Warning: .codebase/ already exists. Running /map-codebase will overwrite existing docs.
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

Remove all worktrees regardless of outcome (D-04: cleanup happens after all agents complete).

### Step 6: Verify

Check that all 6 .codebase/ doc files exist and contain non-empty content.
If any are missing or empty, report which ones need regeneration.

## Error Handling

D-03: Fail fast with clear error
- If .codebase/ check fails: show clear error with remediation
- If worktree creation fails: report which worktree failed
- Do NOT save partial state on error
