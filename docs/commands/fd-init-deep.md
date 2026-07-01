---
description: Initialize .planning/ workspace — create STATE.md, config.json, and phase-1 directory
argument-hint: [--reset]
---

# /fd-init-deep

**Purpose:** Set up the `.planning/` workspace for the project. Run this once before any other FlowDeck command.

## Usage

```
/fd-init-deep [--reset]
```

## Arguments

- `--reset` — wipe and reinitialize an existing planning workspace (prompts for confirmation)

## What Happens

1. **Check for existing workspace.** If `.planning/STATE.md` exists and `--reset` is not passed, the current state is displayed and the command exits without making changes.
2. **Reset (if requested).** When `--reset` is passed, the user must confirm before `.planning/` is deleted and recreated.
3. **Create directories.** Ensures `.planning/`, `.planning/phases/`, and `.planning/phases/phase-1/` exist.
4. **Write STATE.md.** Creates the canonical planning state with phase `1`, status `ready`, and empty step lists.
5. **Write config.json.** Creates the default planning config (`model_profile: balanced`, `tdd_enforced: true`, etc.).
6. **Write PROJECT.md stub.** If it does not already exist, creates a placeholder project overview.

## Output / State

Files created:
- `.planning/STATE.md`
- `.planning/config.json`
- `.planning/phases/phase-1/`
- `.planning/PROJECT.md` (if missing)

## Examples

```
/fd-init-deep
```

Initializes the planning workspace for the current project.

```
/fd-init-deep --reset
```

Reinitializes the planning workspace after confirmation.
