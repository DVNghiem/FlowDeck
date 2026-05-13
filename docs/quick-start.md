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
├── ROADMAP.md       # Phase definitions and features
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

## Step 4: Define a New Feature

Before discussing requirements, initialize the feature:

```
/fd-new-feature user authentication
```

`@orchestrator` creates `.planning/phases/phase-1/FEATURE.md` and updates `STATE.md`. This establishes the feature context and shows you the next steps in the workflow:
1. /fd-discuss
2. /fd-plan
3. /fd-execute
4. /fd-verify

---

## Step 5: Start a Discussion

Requirements gathering comes next. Run:

```
/fd-discuss
```

`@discusser` asks structured questions about your goals, constraints, and success criteria — one question at a time. Each answer is numbered and tracked as a decision (`D-01`, `D-02`, …).

When you finish answering, the decisions are saved to `.planning/phases/phase-1/DISCUSS.md`.

**Tips:**
- Answer specifically. `@discusser` follows up on vague responses.
- Explicit "out of scope" decisions are as useful as "in scope" ones — they prevent scope creep later.
- The session ends with: `"Requirements gathering complete. N decisions recorded."`

---

## Step 6: Create an Implementation Plan

With requirements captured, generate the plan:

```
/fd-plan
```

`@planner` reads `DISCUSS.md` and produces a wave-structured `PLAN.md` in `.planning/phases/phase-1/`. Then `@plan-checker` reviews it for quality — checking that task sizes are reasonable, success criteria are specific, and wave dependencies are correct.

You are shown the plan and prompted for confirmation. **Type `CONFIRM` to allow execution to proceed.** Review carefully before confirming:

- Are success criteria observable and specific?
- Are individual tasks sized to 1–3 hours?
- Do wave dependencies reflect the actual build order?

---

## Step 7: Execute the Feature

Once the plan is confirmed, start implementation:

```
/fd-execute
```

`@orchestrator` reads `STATE.md` and `PLAN.md`, then delegates work to specialist agents in wave order via a TDD cycle (RED → GREEN → REFACTOR):

1. **Behavior** — Define acceptance cases from PLAN.md
2. **RED** — Write failing tests covering each behavior
3. **GREEN** — Implement minimum code to pass tests
4. **REFACTOR** — Clean up code while tests remain green
5. **Review** — `@reviewer` checks code quality and TDD discipline

You see progress updates as each task completes. Independent tasks within a wave run simultaneously.

---

## Step 8: Verify Feature Completion

After implementation, run the full verification pipeline:

```
/fd-verify
```

This runs four checks in parallel:
- **Tests** — Full test suite must pass
- **Code Review** — `@reviewer` checks quality, security, conventions
- **Security Scan** — `@security-auditor` checks for vulnerabilities
- **Deploy Check** — Build verification, CVE audit, readiness assessment

If all checks pass, the phase is marked **VERIFIED**. If any check fails, the report shows what needs fixing.

---

## Step 9: Review the Results

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

> **Check status at any time** — `/fd-status` prints the current state, active plan, and a summary of recent results without modifying anything.

> **Context after a restart** — always run `/fd-resume` at the start of a new OpenCode session on a project that was previously active. Agents have no memory between sessions without it.

> **Follow the workflow order** — the cycle `/fd-new-feature → /fd-discuss → /fd-plan → /fd-execute → /fd-verify` ensures requirements are captured before implementation and verification happens at the end.

> **Skip to execute for small tasks** — for a quick bug fix, you do not need to run `/fd-discuss` and `/fd-plan`. Use `/fd-fix-bug` directly and let `@debug-specialist` handle the full cycle.

> **Let `/fd-quick` drive the whole workflow** — instead of manually calling each command in sequence, run `/fd-quick <your task>` and the system classifies the task, selects the correct workflow (feature, bug fix, UI-heavy, docs), and runs all stages autonomously. It pauses only when your explicit input is needed (e.g., plan CONFIRM, approval gates). Existing commands remain fully usable standalone.

---

← [Back to Index](index.md)
