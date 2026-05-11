---
description: Start a structured requirements discussion using FlowDeck. Extracts decisions and saves to .planning/phases/phase-N/DISCUSS.md
argument-hint: "[phase-number]"
---

Load the FlowDeck discuss workflow for the current (or specified) phase.

**What this does:**
1. Reads `.planning/STATE.md` to determine the current phase
2. Scouts the codebase for relevant context (existing patterns, affected files)
3. Surfaces key decisions that need to be made for this phase
4. Guides you through answering them via conversation
5. Saves decisions to `.planning/phases/phase-N/DISCUSS.md`

**Output:** A DISCUSS.md file with locked decisions that guide the planner and coder.

**Next step after this:** Run `/fd-plan` to create the implementation plan.

## What Next?

After discussion completes, choose your next step:

1. **Create implementation plan** → `/fd-plan [phase-number]`
2. **Continue discussion** → `/fd-discuss [phase-number]`
3. **Review existing work** → `/fd-verify`
4. **Check project dashboard** → `/fd-dashboard`

Type the number or the command to proceed.
