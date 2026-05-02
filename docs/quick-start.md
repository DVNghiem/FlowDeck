# Quick Start

Get FlowDeck running on a project in 15 minutes.

---

## Step 0: Verify the Installation

Before opening OpenCode, confirm the install completed successfully:

```bash
ls ~/.config/opencode/agent/ | grep -c "\.md"   # expect 23+
ls ~/.config/opencode/skills/                    # expect 24 directories
ls ~/.config/opencode/command/                   # expect 16 files
```

If any count is short, re-run the installer. See [Installation](installation.md) for details.

---

## Step 1: Open a Project in OpenCode

Navigate to your project directory and start OpenCode:

```bash
cd my-project
opencode
```

FlowDeck activates automatically because `@dv.nghiem/flowdeck` is registered in `~/.config/opencode/opencode.json`. All agents, skills, and commands are available immediately.

---

## Step 2: Initialize FlowDeck

Run the setup command inside the OpenCode session:

```
/fd-new-project MyApp
```

This creates the `.planning/` directory at your project root with the following structure:

```
.planning/
├── PROJECT.md       # Project context: name, goals, constraints, tech stack
├── STATE.md         # Current execution state, tracked by all agents
├── ROADMAP.md       # Phase definitions and milestones
└── config.json      # FlowDeck project configuration
```

You will be prompted to fill in basic project details. The more context you provide in `PROJECT.md`, the better agents perform throughout the workflow.

---

## Step 3: Map the Codebase (existing projects only)

If you are adding FlowDeck to an existing project rather than starting from scratch, run:

```
/fd-map-codebase
```

`@mapper` analyzes your source tree and generates `.codebase/` documentation files:

- `.codebase/STACK.md` — tech stack with detected versions and frameworks
- `.codebase/ARCHITECTURE.md` — component structure and data flow between modules
- `.codebase/CONVENTIONS.md` — naming patterns, code style, and project-specific idioms

All subsequent agents read these files for context. Skip this step for brand-new projects.

---

## Step 4: Start a Discussion

Requirements gathering comes before planning. Run:

```
/fd-discuss 1
```

`@discusser` asks structured questions about your goals, constraints, and success criteria — one question at a time. Each answer is numbered and tracked as a decision (`D-01`, `D-02`, …).

When you finish answering, the decisions are saved to `.planning/phases/phase-1/DISCUSS.md`.

**Tips:**
- Answer specifically. `@discusser` follows up on vague responses.
- Explicit "out of scope" decisions are as useful as "in scope" ones — they prevent scope creep later.
- The session ends with: `"Requirements gathering complete. N decisions recorded."`

---

## Step 5: Create an Implementation Plan

With requirements captured, generate the plan:

```
/fd-plan 1
```

`@flowdeck-planner` reads `DISCUSS.md` and produces a wave-structured `PLAN.md` in `.planning/phases/phase-1/`. Then `@flowdeck-plan-checker` reviews it for quality — checking that task sizes are reasonable, success criteria are specific, and wave dependencies are correct.

You are shown the plan and prompted for confirmation. **Type `CONFIRMED` to allow execution to proceed.** Review carefully before confirming:

- Are success criteria observable and specific?
- Are individual tasks sized to 1–3 hours?
- Do wave dependencies reflect the actual build order?

---

## Step 6: Execute a Feature

Once the plan is confirmed, start implementation:

```
/fd-new-feature "user authentication with JWT"
```

`@orchestrator` reads `STATE.md` and `PLAN.md`, then delegates work to specialist agents in wave order:

1. **Wave 1** — `@architect` designs the component structure and API contracts
2. **Wave 2** — `@coder` and `@researcher` implement in parallel (independent tasks)
3. **Wave 3** — `@tester` writes and runs tests against the completed implementation
4. **Wave 4** — `@reviewer` reviews the full changeset

You see progress updates as each wave completes. Independent tasks within a wave run simultaneously via the `run-parallel` tool.

---

## Step 7: Review the Code

After implementation, run the review phase against staged changes:

```
/fd-review-code staged
```

`@reviewer`, `@security-auditor`, and `@tester` run in parallel. Their findings are aggregated into a single report ranked by severity: Critical → High → Medium → Pass.

Address any Critical or High findings before merging.

---

## Step 8: Save State

Before closing OpenCode, checkpoint your progress:

```
/fd-checkpoint
```

This writes the current execution state to `.planning/STATE.md`. To reload context in a future session:

```
/fd-resume
```

`/fd-resume` reads `STATE.md` and the active `PLAN.md` and restores full context for all agents.

---

## Tips

> **Check status at any time** — `/fd-progress` prints the current state, active plan, and a summary of recent results without modifying anything.

> **Context after a restart** — always run `/fd-resume` at the start of a new OpenCode session on a project that was previously active. Agents have no memory between sessions without it.

> **Follow the "What Next?" prompt** — after each FlowDeck command completes, the orchestrating agent presents a set of suggested next steps. Reading these keeps you on the intended workflow path.

> **Skip steps for small tasks** — for a quick bug fix, you do not need to run `/fd-discuss` and `/fd-plan`. Use `/fd-fix-bug` directly and let `@debug-specialist` handle the full cycle.

---

← [Back to Index](index.md)
