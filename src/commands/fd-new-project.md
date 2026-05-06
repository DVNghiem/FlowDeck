---
description: Initialize .planning/ structure for a new project — creates PROJECT.md, REQUIREMENTS.md, ROADMAP.md, and STATE.md
argument-hint: [project-name]
---

# New Project

Initialize FlowDeck planning structure for the current workspace.

## Steps

1. Check if `.planning/` already exists — if it does, warn the user and ask before overwriting.

2. Create the `.planning/` directory and the following files if they do not exist:

**`.planning/PROJECT.md`**
```markdown
# Project

**Name:** $ARGUMENTS
**Description:** (set via /fd-discuss)
**Tech stack:** (set via /fd-discuss)

---

## Goals

-

## Non-negotiables

-

## Out of Scope

-
```

**`.planning/REQUIREMENTS.md`**
```markdown
# Requirements

**Project:** $ARGUMENTS
**Version:** 1.0

---

## v1 Requirements

```

**`.planning/ROADMAP.md`**
```markdown
# Roadmap

**Project:** $ARGUMENTS
**Version:** 1.0

---

## Overview

| Phase | Name | Purpose |
|-------|------|---------|
| 1 | Setup | |

---
```

**`.planning/STATE.md`**
```markdown
---
flowdeck_state_version: 1.0
milestone: v1.0
last_updated: "<current timestamp>"
progress:
  total_phases: 1
  completed_phases: 0
---

# State

**Project:** $ARGUMENTS
**Last updated:** <current timestamp>

## Current Phase

phase: 1
status: planned
plan_file: none
plan_confirmed: false
confirmed_at: none

## Progress

- [ ] Phase 1: Setup
```

3. Also create `.planning/phases/phase-1/` directory.

4. Create `.planning/config.json` with default settings:

```json
{
  "model_profile": "balanced",
  "tdd_enforced": true,
  "approval_required": false,
  "volatility_threshold": 0.7,
  "default_agent": "orchestrator"
}
```

5. Report success with the list of files created and next steps:
   - Run `/fd-new-feature` to define your first feature
   - Edit `.planning/config.json` directly to change settings
