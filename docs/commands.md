# FlowDeck Commands

Commands are slash commands registered in OpenCode. Run them by typing `/command-name [arguments]` in any OpenCode session.

## Quick Reference

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/fd-new-project` | `[project-name]` | Initialize project with planning structure and default config |
| `/fd-new-feature` | `[feature-description]` | Define a new feature and initialize feature context |
| `/fd-discuss` | `[topic]` | Structured Q&A to capture decisions for a phase |
| `/fd-plan` | `[--phase=N]` | Generate detailed implementation plan from decisions |
| `/fd-design` | `[--mode=draft\|review\|system] [task-description]` | Run design-first stages, UI review, or design-system guidance for UI-heavy tasks |
| `/fd-execute` | `[--phase=N] [--override]` | Implement feature with TDD pipeline and parallel agents |
| `/fd-verify` | `[--phase=N] [--env=staging\|production]` | Verify feature completion: tests, review, security, deploy check |
| `/fd-fix-bug` | `[bug-description]` | Debug, fix, and verify bug with regression test |
| `/fd-deploy-check` | `[--check=deploy,review,analysis]` | Pre-deploy checks, code review, or pre-change analysis |
| `/fd-status` | `[--roadmap \| --workspace \| --phase=N]` | Combined status, roadmap, and workspace view |
| `/fd-resume` | `[--yes]` | Reload STATE.md and PLAN.md to continue interrupted session |
| `/fd-checkpoint` | — | Persist current state to STATE.md |
| `/fd-reflect` | `[--mode=reflect,learn]` | Post-session reflection or capture skill from session |
| `/fd-map-codebase` | `[--incremental]` | Map codebase into structured `.codebase/` files |
| `/fd-write-docs` | `[--scope=path]` | Explore APIs and generate documentation |
| `/fd-multi-repo` | `[list \| add <path> [name] \| remove <name> \| status]` | Multi-repo orchestration |
| `/fd-translate-intent` | `[vague intent]` | Convert vague request into ranked implementation options |
| `/fd-ask` | `[question]` | Route question to specialist agent (architect, security, etc.) |
| `/fd-quick` | `[task description]` | Autonomous workflow launcher — classifies task, selects correct workflow, runs all stages end-to-end |
| `/fd-doctor` | — | Check FlowDeck installation and environment health |

---

## Detailed Command Reference

## /fd-new-project

**Description:** Bootstraps a new FlowDeck-managed project. Creates the `.planning/` directory and all required state files including default config.

**Arguments:**
- `[project-name]` — name of the project (optional; defaults to current directory name)

**What it does:**
1. Creates `.planning/` directory
2. Generates `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
3. Creates `.planning/config.json` with default settings (model_profile, tdd_enforced, etc.)
4. Creates `.planning/phases/phase-1/` directory

**Example:**
```
/fd-new-project my-api-service
```

**What Next?**
1. Run `/fd-new-feature` to define your first feature
2. Run `/fd-map-codebase` if this is an existing codebase
3. Edit `.planning/config.json` directly to change settings

---

## /fd-new-feature

**Description:** Define a new feature and initialize feature context. This is the first step of the feature workflow after project setup.

**Arguments:**
- `[feature-description]` — name or short description of the feature

**What it does:**
1. Reads `.planning/STATE.md` to determine current phase
2. Creates `.planning/phases/phase-N/FEATURE.md` with feature context
3. Updates STATE.md with feature definition
4. Displays the workflow steps ahead: discuss → plan → execute → verify

**Example:**
```
/fd-new-feature user authentication
```

**What Next?**
1. Run `/fd-discuss` to capture requirements
2. Run `/fd-plan` to create implementation plan
3. Run `/fd-execute` to implement with TDD
4. Run `/fd-verify` to confirm all checks pass

---

## /fd-discuss

**Description:** Opens a structured Q&A session to capture decisions for a phase. Saves decisions to `.planning/phases/phase-N/DISCUSS.md` with D-XX numbering.

**Arguments:**
- `[topic]` — optional topic to focus the discussion

**What it does:**
1. Loads `.planning/FEATURE.md` and `.planning/STATE.md` for context
2. Invokes `@discusser` agent which asks targeted questions one at a time
3. Records decisions with D-XX numbering (D-01, D-02, …)
4. Saves to `.planning/phases/phase-N/DISCUSS.md`

**Example:**
```
/fd-discuss
```

**What Next?**
1. Run `/fd-plan` to generate implementation plan from decisions
2. Run `/fd-discuss` again to add more decisions if needed

---

## /fd-plan

**Description:** Reads decisions from DISCUSS.md and produces a detailed implementation plan. Requires explicit CONFIRM before saving.

**Arguments:**
- `[--phase=N]` — target specific phase
- `[--yes]` — skip confirmation

**What it does:**
1. Reads `.planning/phases/phase-N/DISCUSS.md` for decisions
2. Creates detailed `PLAN.md` with tasks tracing D-XX decisions
3. Validates plan completeness
4. **PAUSES** for user CONFIRM before saving

**Example:**
```
/fd-plan
/fd-plan --phase=1
```

**What Next?**
1. If UI-heavy, run `/fd-design --mode=draft` first
2. Run `/fd-execute` to implement the plan
3. Run `/fd-plan --phase=2` for next phase

---

## /fd-design

**Description:** Design-first workflow for UI-heavy tasks. Supports planning (`draft`), fidelity review (`review`), and design system updates (`system`).

**Arguments:**
- `[--mode=draft|review|system]` — default is `draft`
- `[task-description]` — UI task or review scope
- `[--override]` — explicit override path when skipping design gate

**What it does:**
1. Detects UI-heavy task types (landing page, dashboard, admin panel, app screen, etc.)
2. Runs structured design stages: discovery → UX planning → wireframe/layout → visual system → approval → handoff
3. Persists structured design artifact in planning state for downstream implementation
4. In `review` mode, reports design fidelity gaps against approved artifacts
5. In `system` mode, generates or updates token and component guidance

**Example:**
```
/fd-design --mode=draft redesign dashboard onboarding
/fd-design --mode=review phase-2 dashboard implementation
/fd-design --mode=system app shell tokens
```

---

## /fd-execute

**Description:** Implement the current phase's plan using TDD discipline with parallel agents. This is the execution step after planning is confirmed.

**Arguments:**
- `[--phase=N]` — target specific phase
- `[--override]` — bypass guards and proceed anyway

**What it does:**
1. Reads `.planning/phases/phase-N/PLAN.md` for implementation steps
2. If UI-heavy and design-first is enabled, requires approved design handoff before coding
3. For each step, enforces TDD cycle: BEHAVIOR → RED → GREEN → REFACTOR
3. `@tester` writes failing tests first
4. Implementation agent (`@backend-coder` / `@frontend-coder` / `@devops`) implements minimum to pass
5. `@reviewer` confirms quality
6. Updates `STATE.md` with completed steps
7. Waves execute in order, with parallel tasks within each wave

**Example:**
```
/fd-execute
/fd-execute --phase=1
```

**What Next?**
1. Run `/fd-verify` to confirm all checks pass
2. Commit changes and create pull request
3. Run `/fd-checkpoint` to save session state

---

## /fd-verify

**Description:** Verify feature completion with full test suite, code review, security scan, and deploy check.

**Arguments:**
- `[--phase=N]` — target specific phase
- `[--env=staging|production]` — environment for deploy check (default: staging)

**What it does:**
1. Runs test suite — all tests must pass
2. Runs code review — `@reviewer` checks quality, security, conventions
3. Runs security scan — `@security-auditor` checks for vulnerabilities
4. Runs deploy check — build verification, CVE audit, readiness
5. Aggregates all findings into a verification report
6. Updates STATE.md if all checks pass

**Example:**
```
/fd-verify
/fd-verify --phase=1 --env=production
```

**Verdict:**
- ✅ **VERIFIED** — all checks pass, feature is ready
- ❌ **NOT VERIFIED** — one or more checks failed; review report and fix issues

**What Next?**
1. If VERIFIED: merge changes, deploy, or move to next phase
2. If NOT VERIFIED: fix issues and run `/fd-verify` again

---

## /fd-new-feature (old — now use /fd-execute)

**Description:** Implements a new feature end-to-end using TDD discipline with parallel agents. Reads active PLAN.md for context.

**DEPRECATED:** Use `/fd-execute` instead. The `/fd-new-feature` command is now the entry point for defining features (step 1 of 6).

**Arguments:**
- `[feature-description]` — plain-language description of the feature

**What it does:**
1. Enforces TDD cycle: BEHAVIOR → RED → GREEN → REFACTOR
2. `@tester` writes failing tests first
3. Implementation agent (`@backend-coder` / `@frontend-coder` / `@devops`) implements minimum to pass
4. `@reviewer` confirms quality
5. Updates `STATE.md` with completed steps

**Example:**
```
/fd-execute "user authentication with JWT"
```

---

## /fd-fix-bug

**Description:** Diagnoses and fixes a bug using TDD discipline with regression test.

**Arguments:**
- `[bug-description]` — description of the bug

**What it does:**
1. `@researcher` investigates and isolates root cause
2. `@tester` writes regression test that fails (RED)
3. Implementation agent (`@backend-coder` / `@frontend-coder` / `@devops`) implements minimum fix (GREEN)
4. `@reviewer` confirms fix (REFACTOR)
5. Records in `.codebase/FAILURES.json`

**Example:**
```
/fd-fix-bug "user sessions expire immediately"
```

---

## /fd-deploy-check

**Description:** All-in-one quality gate combining pre-deployment checks, code review, and pre-change analysis.

**Arguments:**
- `[--check=deploy,review,analysis]` — type of check (default: deploy)
- `[--env=staging|production]` — target environment (default: staging)
- `[--scope=path]` — file scope for review/analysis

**Check Types:**

### Deploy (`--check=deploy` or default)
Runs parallel checks: test suite, security scan, CVE audit, build verification, code review.

### Review (`--check=review`)
Parallel reviewer + researcher + tester on changed files. Aggregates findings by severity (CRITICAL/HIGH/MEDIUM/LOW).

### Analysis (`--check=analysis`)
Comprehensive pre-change analysis: impact radar, blast radius, regression prediction, test gaps, volatility, review routing.

**Example:**
```
/fd-deploy-check --check=deploy
/fd-deploy-check --check=review --scope=src/auth/
/fd-deploy-check --check=analysis "add refresh token support"
```

---

## /fd-status

**Description:** View project status combining progress, roadmap, and workspace overview.

**Arguments:**
- (no flags) — show current phase status summary
- `[--roadmap]` — display project roadmap with phase statuses
- `[--workspace]` — show all registered repositories overview
- `[--phase=N]` — show detailed progress for specific phase

**Example:**
```
/fd-status
/fd-status --roadmap
/fd-status --workspace
/fd-status --phase=2
```

---

## /fd-resume

**Description:** Reload STATE.md and PLAN.md to continue an interrupted session.

**Arguments:**
- `[--yes]` — skip confirmation pause

**What it does:**
1. Reads current phase and status from STATE.md
2. Shows plan preview from active PLAN.md
3. **PAUSES** for user CONFIRM (unless `--yes`)
4. Continues execution from where stopped

**Example:**
```
/fd-resume
/fd-resume --yes
```

---

## /fd-checkpoint

**Description:** Persist current session state to STATE.md. Safe to close session after.

**Arguments:** None

**What it does:**
1. Updates `.planning/STATE.md` with current phase, completed steps, last action
2. Writes checkpoint summary to `.planning/phases/phase-N/CHECKPOINT.md`

**Example:**
```
/fd-checkpoint
```

---

## /fd-reflect

**Description:** Post-session reflection to analyse artifacts and propose improvements. Can also capture session learnings as reusable skills.

**Arguments:**
- `[--mode=reflect]` — default reflection mode
- `[--mode=learn]` — capture pattern as reusable skill

**Reflect Mode:**
- Analyzes session artifacts for patterns
- Proposes new skills, policies, or workflow changes
- Provides 3-5 bullet summary of learnings

**Learn Mode:**
- Identifies worth-capturing patterns from session
- Creates reusable skill in `src/skills/`
- Reports what was captured and activation reminder

**Example:**
```
/fd-reflect
/fd-reflect --mode=learn auth-pattern
```

---

## /fd-map-codebase

**Description:** Analyze codebase and generate structured documentation in `.codebase/`.

**Arguments:**
- `[--incremental]` — only update changed files

**What it does:**
1. Runs 6 mapper agents in parallel (each in isolated worktree)
2. Generates: STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

**Example:**
```
/fd-map-codebase
/fd-map-codebase --incremental
```

---

## /fd-write-docs

**Description:** Explore public APIs and generate accurate documentation.

**Arguments:**
- `[--scope=path]` — limit to specific path
- `[--format=api,guide,readme]` — output format

**What it does:**
1. Finds all exported functions, classes, types
2. `@writer` drafts documentation
3. `@reviewer` verifies accuracy against actual code
4. Writes to docs/ directory

**Example:**
```
/fd-write-docs --scope=src/auth --format=api
```

---

## /fd-multi-repo

**Description:** Orchestrate changes spanning multiple repositories.

**Arguments:**
- `list` — show registered repos
- `add <path> [name]` — register a repository
- `remove <name>` — unregister a repository
- `status` — show status across all repos

**Example:**
```
/fd-multi-repo list
/fd-multi-repo add ../user-service user-service
/fd-multi-repo status
```

---

## /fd-translate-intent

**Description:** Convert vague or high-level requests into concrete ranked implementation options with tradeoffs.

**Arguments:**
- `[vague intent]` — e.g., "make checkout faster"

**What it does:**
1. `@architect` decomposes into 3-5 concrete options
2. `@researcher` provides codebase context for each
3. Report shows options ranked with effort/risk/tradeoffs

**Example:**
```
/fd-translate-intent make checkout faster
```

---

## /fd-ask

**Description:** Route a focused question to the most appropriate specialist agent.

**Arguments:**
- `[question]` — your question

**Routing:**
| Keywords | Agent |
|----------|-------|
| design, architecture, structure | @architect |
| security, auth, vulnerability | @security-auditor |
| performance, optimize, latency | @performance-optimizer |
| impact, downstream, dependency | @researcher |
| test, coverage, regression | @tester |
| bug, error, debug | @debug-specialist |

**Example:**
```
/fd-ask what is the architecture of the auth system?
/fd-ask how would I add rate limiting?
```

---

## /fd-quick

**Description:** Autonomous workflow launcher. Classifies the task, selects the correct existing FlowDeck workflow, and runs all stages end-to-end with minimal user input. Routes all clarifying questions through `@supervisor`.

**Arguments:**
- `[task description]` — what you need done (any phrasing — the command classifies it)

**Task Classification:**

| Classification | Trigger Signals | Stage Sequence |
|----------------|-----------------|----------------|
| `feature` | Substantive description, no specific signals | `discuss → plan → execute → verify` |
| `ui-feature` | landing page, dashboard, admin panel, app screen, ux flow | `discuss → design → plan → execute → verify` |
| `bugfix` | fix, bug, error, crash, regression, broken, exception | `discuss → fix-bug → verify` |
| `docs` | docs, documentation, readme, api docs, write docs | `discuss → write-docs → verify` |
| `simple` | rename, typo, minor, move file | `execute → verify` |
| `ambiguous` | vague or too short | *supervisor asks one clarifying question* |

**What it does:**
1. Classifies the task from `$ARGUMENTS` using signal patterns
2. Routes ambiguous tasks through `@supervisor` for a single focused clarifying question
3. Presents the selected stage sequence to the user
4. Executes each stage in order using the existing registered commands (`/fd-discuss`, `/fd-plan`, etc.)
5. Gates each stage through `@supervisor` preflight review (approve / revise / block / escalate)
6. Respects all workflow discipline: TDD gates, design-first gate for UI tasks, plan CONFIRM gate
7. Pauses only when a supervisor gate requires user approval, or when blocked
8. Records all routing decisions, stage transitions, and supervisor decisions in STATE.md
9. On block: explains exactly what stopped execution and what is needed to resume

**What it preserves:**
- All existing commands (`/fd-discuss`, `/fd-plan`, `/fd-execute`, etc.) remain independently usable
- TDD enforcement is never bypassed
- Design-first gate for UI-heavy tasks is enforced
- Plan CONFIRM gate is always presented to the user
- Verify pipeline always runs at end

**Example:**
```
/fd-quick add two-factor authentication to the login system
/fd-quick fix the checkout crash when cart is empty
/fd-quick build a new analytics dashboard for admin users
/fd-quick write API documentation for the user service
/fd-quick rename MAX_RETRIES constant to RETRY_LIMIT
```

**Resume after a block:**
```
/fd-quick <original task description>
```
`/fd-quick` resumes from the last completed stage automatically.

---

## /fd-doctor

**Description:** Check FlowDeck installation and environment health.

**Arguments:** None

**What it checks:**
- OpenCode CLI version
- FlowDeck plugin registration
- Workspace state (STATE.md)
- Codebase map (ARCHITECTURE.md)
- Planning phases directory

**Example:**
```
/fd-doctor
```

---

← [Back to Index](index.md)