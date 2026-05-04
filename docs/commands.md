# FlowDeck Commands

Commands are slash commands registered in OpenCode. Run them by typing `/command-name [arguments]` in any OpenCode session.

## Quick Reference

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/fd-new-project` | `[project-name]` | Initialize `.planning/` directory and project state files |
| `/fd-discuss` | `[phase-number]` | Structured Q&A session to capture decisions for a phase |
| `/fd-plan` | `[phase-number]` | Generate a detailed implementation plan from discussion output |
| `/fd-new-feature` | `[feature-description]` | Full feature implementation with parallel agents |
| `/fd-fix-bug` | `[bug-description\|issue-number]` | Debug, fix, and verify a bug with regression test |
| `/fd-review-code` | `[scope]` | Parallel code review and security audit |
| `/fd-deploy-check` | — | Pre-deploy gate: tests, review, CVE scan |
| `/fd-write-docs` | — | Explore public APIs and generate documentation |
| `/fd-map-codebase` | `[--full] [--update]` | Map codebase into structured `.codebase/` files |
| `/fd-progress` | — | Display current STATE.md and active plan (no agents) |
| `/fd-checkpoint` | — | Persist current state to STATE.md |
| `/fd-resume` | — | Reload STATE.md and PLAN.md context in a new session |
| `/fd-dashboard` | — | Project dashboard: phases, milestones, blockers |
| `/fd-roadmap` | — | View or update ROADMAP.md with phase statuses |
| `/fd-settings` | — | View or update FlowDeck model and workspace settings |
| `/fd-multi-repo` | `[--add\|--list\|--status\|--remove]` | Manage multi-repo configuration |
| `/fd-impact-radar` | `[--change] [--scope]` | Predict affected files, APIs, tests before editing |
| `/fd-blast-radius` | `[--change] [--depth]` | Show downstream consequences and hidden dependencies |
| `/fd-translate-intent` | `[--intent]` | Convert vague request into ranked concrete implementation options |
| `/fd-volatility-map` | `[--threshold] [--limit]` | Show unstable code zones by churn and hotfix frequency |
| `/fd-regression-predict` | `[--change] [--categories]` | Estimate likely regression categories for a change |
| `/fd-test-gap` | `[--change] [--scope]` | Identify weakly-tested areas in a proposed change |
| `/fd-review-route` | `[--files] [--change]` | Route risky patches to the right reviewer type |

---

## Detailed Command Reference

## /fd-new-project

**Description:** Bootstraps a new FlowDeck-managed project. Creates the `.planning/` directory and all required state files so subsequent commands have a place to read and write context.

**Arguments:**
- `[project-name]` — name of the project (optional; defaults to current directory name)

**What it does:**
1. Creates `.planning/` directory in the current working directory
2. Generates `.planning/PROJECT.md` with project name, description placeholders, and tech stack fields
3. Generates `.planning/ROADMAP.md` with a blank phase structure
4. Generates `.planning/STATE.md` with initial status set to `setup`
5. Generates `.planning/config.json` with default model assignments, guard settings, and an empty `sub_repos` array
6. Prompts you to fill in the project description and tech stack

**Example:**
```
/fd-new-project my-api-service
```

**What Next?**
1. Run `/fd-discuss 1` to begin structured discovery for Phase 1
2. Run `/fd-map-codebase` if this is an existing codebase you want indexed
3. Run `/fd-settings` to configure model assignments before proceeding

---

## /fd-discuss

**Description:** Opens a structured Q&A session for a given phase. The `@discusser` agent asks targeted questions to surface requirements, constraints, and decisions, then saves everything to a phase file.

**Arguments:**
- `[phase-number]` — the phase number to discuss (required; e.g. `1`, `2`)

**What it does:**
1. Loads `.planning/PROJECT.md` and `.planning/STATE.md` for project context
2. Invokes `@discusser`, which asks a sequence of structured questions about goals, constraints, edge cases, and acceptance criteria
3. You answer each question in the session
4. Saves all decisions to `.planning/phases/phase-N/DISCUSS.md` using `D-XX` numbering (D-01, D-02, …)
5. Updates `STATE.md` to record that discussion for this phase is complete

**Example:**
```
/fd-discuss 1
```

**What Next?**
1. Run `/fd-plan 1` to generate a detailed implementation plan from this discussion
2. Run `/fd-discuss 1` again to add more decisions if you missed something
3. Run `/fd-progress` to review the current project state

---

## /fd-plan

**Description:** Reads the discussion output for a phase and produces a detailed, step-by-step implementation plan. Requires explicit confirmation before finalizing.

**Arguments:**
- `[phase-number]` — the phase to plan (required; must have a completed DISCUSS.md)

**What it does:**
1. Reads `.planning/phases/phase-N/DISCUSS.md` for decisions and requirements
2. Invokes `@planner`, which produces a detailed `PLAN.md` with tasks, dependencies, file paths, and acceptance criteria
3. Invokes `@plan-checker` to validate the plan for completeness, contradiction, and missing edge cases
4. Displays the plan and any checker feedback
5. Prompts: **type `CONFIRMED` to accept the plan and write it to disk**
6. On confirmation, saves `.planning/phases/phase-N/PLAN.md` and updates `STATE.md`

**Example:**
```
/fd-plan 1
```

**What Next?**
1. Run `/fd-new-feature "feature description"` to implement the first item in the plan
2. Run `/fd-progress` to see the full plan summary
3. Run `/fd-plan 1` again to regenerate the plan if requirements changed

---

## /fd-new-feature

**Description:** Implements a new feature end-to-end using an orchestrated pipeline of parallel agents. Reads the active PLAN.md for context before starting.

**Arguments:**
- `[feature-description]` — plain-language description of the feature (required)

**What it does:**
1. Reads the active `.planning/phases/*/PLAN.md` for context
2. `@orchestrator` assesses scope and invokes `@parallel-coordinator` if work exceeds ~30 minutes
3. Executes the standard 4-wave pattern:
   - **Wave 1 (parallel):** `@researcher` gathers relevant docs/best practices; `@code-explorer` maps existing patterns
   - **Wave 2 (serial):** `@architect` produces interface contracts and data models
   - **Wave 3 (parallel):** `@coder` implements against Wave 2 interfaces; `@tester` writes tests against those same interfaces
   - **Wave 4 (parallel):** `@reviewer` checks logic and quality; `@security-auditor` runs OWASP checklist
4. Aggregates results into a feature summary
5. Updates `STATE.md` with the completed feature

**Example:**
```
/fd-new-feature "user authentication with JWT and refresh tokens"
```

**What Next?**
1. Run `/fd-review-code src/auth/` to do an additional focused review
2. Run `/fd-fix-bug` if any issues were surfaced during implementation
3. Run `/fd-checkpoint` to save state before moving on
4. Run `/fd-new-feature` again for the next planned feature

---

## /fd-fix-bug

**Description:** Diagnoses and fixes a bug through a focused pipeline: scope analysis, mini-plan, code fix, regression test, and reviewer sign-off.

**Arguments:**
- `[bug-description or issue-number]` — plain-language description of the bug, or a GitHub/tracker issue number (required)

**What it does:**
1. `@debug-specialist` analyzes scope: identifies the failing code path, reproduces the issue, and determines root cause
2. Produces a mini-plan (2–5 steps) for the fix
3. `@coder` applies the fix
4. `@tester` writes a regression test that would have caught the bug
5. `@reviewer` confirms the fix is complete and the regression test passes
6. Updates `STATE.md` with the resolved bug reference

**Example:**
```
/fd-fix-bug "user sessions expire immediately after login"
/fd-fix-bug 412
```

**What Next?**
1. Run `/fd-review-code` on the changed files for a full quality pass
2. Run `/fd-deploy-check` if this is a hotfix going to production
3. Run `/fd-checkpoint` to save state
4. Run `/fd-progress` to see remaining open issues

---

## /fd-review-code

**Description:** Runs a parallel code review and security audit on the specified scope, then aggregates findings into a tiered report.

**Arguments:**
- `[scope]` — file path, directory path, or `staged` (reviews only git-staged changes); required

**What it does:**
1. `@reviewer` and `@security-auditor` run in parallel over the specified scope
2. `@reviewer` checks: logic correctness, error handling, naming, test coverage, anti-patterns
3. `@security-auditor` checks: OWASP Top 10, authentication/authorization, injection risks, secrets in code, dependency vulnerabilities
4. Results are aggregated into a structured report with three tiers:
   - **Critical** — must fix before merge
   - **Major** — should fix; requires justification to skip
   - **Minor** — suggestions and style notes
5. Saves report to `.planning/reviews/REVIEW-<timestamp>.md`

**Example:**
```
/fd-review-code src/payments/
/fd-review-code staged
/fd-review-code src/api/handlers/user.ts
```

**What Next?**
1. Address **Critical** findings first, then re-run `/fd-review-code` on the changed files
2. Run `/fd-fix-bug` for any defects surfaced in the review
3. Run `/fd-deploy-check` once all criticals are resolved
4. Run `/fd-checkpoint` to save progress

---

## /fd-deploy-check

**Description:** Runs a full pre-deployment gate. All checks must pass before the orchestrator issues a go/no-go decision. Blocks deploy if any check fails.

**Arguments:** None

**What it does:**
1. Runs three checks in parallel:
   - `@tester` executes the full test suite and checks coverage thresholds
   - `@reviewer` does a final quality pass on changes since the last deploy
   - CVE scanner checks all dependencies against known vulnerability databases
2. `@orchestrator` collects results from all three
3. If all pass: issues **GO** decision and prints a deploy summary
4. If any fail: issues **NO-GO** decision with specific failure details and a remediation list
5. Saves the decision report to `.planning/fd-deploy-checks/DEPLOY-<timestamp>.md`

**Example:**
```
/fd-deploy-check
```

**What Next?**
1. If **GO**: proceed with your deployment pipeline
2. If **NO-GO**: address each listed failure, then re-run `/fd-deploy-check`
3. Run `/fd-fix-bug` for any test failures surfaced
4. Run `/fd-checkpoint` after a successful deploy check

---

## /fd-write-docs

**Description:** Explores all public APIs in the codebase and generates documentation. A `@reviewer` then checks the draft for accuracy against the actual code.

**Arguments:** None

**What it does:**
1. `@code-explorer` scans the codebase for public-facing interfaces, exported functions, REST endpoints, and configuration options
2. `@writer` drafts documentation: function signatures with descriptions, parameter tables, return values, usage examples, and any error conditions
3. `@reviewer` verifies every documented item against the actual source code, flagging inaccuracies
4. Final docs are written to the project's `docs/` directory (or the path set in `.planning/config.json`)
5. Updates `STATE.md` to record documentation generation

**Example:**
```
/fd-write-docs
```

**What Next?**
1. Review the generated docs and edit sections that need domain context
2. Run `/fd-write-docs` again after adding new public APIs
3. Run `/fd-review-code docs/` if you want a quality pass on the written docs
4. Run `/fd-checkpoint` to save state

---

## /fd-map-codebase

**Description:** Builds a structured map of the codebase into `.codebase/` files. Essential before starting work on an unfamiliar or large project.

**Arguments:**
- `[--full]` — perform a deep scan including all dependencies and test files (optional)
- `[--update]` — update an existing map rather than regenerating from scratch (optional)

**What it does:**
1. `@code-explorer` scans the entire project (respecting `.gitignore`)
2. Writes or updates five files in `.codebase/`:
   - `STACK.md` — languages, frameworks, major libraries, and versions
   - `ARCHITECTURE.md` — high-level architecture: layers, services, data flow
   - `STRUCTURE.md` — directory tree with purpose annotations per directory
   - `CONVENTIONS.md` — naming patterns, file organization rules, detected style
   - `TESTING.md` — test framework, test locations, coverage tooling, CI integration
3. Updates `.planning/STATE.md` to note that codebase map is current

**Example:**
```
/fd-map-codebase
/fd-map-codebase --full
/fd-map-codebase --update
```

**What Next?**
1. Run `/fd-discuss 1` now that the AI has full codebase context
2. Review `.codebase/CONVENTIONS.md` and add any corrections before proceeding
3. Run `/fd-map-codebase --update` after significant refactors to keep the map current

---

## /fd-progress

**Description:** Displays a snapshot of the current project state. Reads directly from state files — no agents are invoked.

**Arguments:** None

**What it does:**
1. Reads and displays `.planning/STATE.md` — current phase, status, last action
2. Reads and displays the active `.planning/phases/*/PLAN.md` — remaining tasks
3. Shows recent command results from the session log
4. Reports any blockers or pending decisions recorded in STATE.md

**Example:**
```
/fd-progress
```

**What Next?**
1. Run the next command indicated by the active plan
2. Run `/fd-dashboard` for a more visual phase-by-phase view
3. Run `/fd-roadmap` to see the full project timeline

---

## /fd-checkpoint

**Description:** Persists the current session state to `.planning/STATE.md`. Run this before closing an OpenCode session so nothing is lost.

**Arguments:** None

**What it does:**
1. Writes current phase, completed tasks, pending tasks, and any in-progress context to `.planning/STATE.md`
2. Records a timestamp and session summary
3. Confirms: "State saved. Safe to close this session."

**Example:**
```
/fd-checkpoint
```

**What Next?**
1. Close and reopen your OpenCode session
2. Run `/fd-resume` in the new session to reload context
3. Run `/fd-progress` to verify state was saved correctly

---

## /fd-resume

**Description:** Reloads project context at the start of a new OpenCode session. Reads STATE.md and the active PLAN.md so you can continue where you left off.

**Arguments:** None

**What it does:**
1. Reads `.planning/STATE.md` and reports current phase and status
2. Reads the active `.planning/phases/*/PLAN.md` and loads its task list into context
3. Summarizes: what was last done, what is next, any pending decisions
4. Does not invoke any agents — purely a context-loading operation

**Example:**
```
/fd-resume
```

**What Next?**
1. Run the next task from the active plan
2. Run `/fd-progress` for a full status view
3. Run `/fd-discuss` or `/fd-plan` if context indicates a phase is not yet planned

---

## /fd-dashboard

**Description:** Renders a project dashboard showing phase-by-phase progress, milestone status, and any active blockers.

**Arguments:** None

**What it does:**
1. Reads `.planning/ROADMAP.md`, `.planning/STATE.md`, and all phase directories
2. Renders a structured dashboard:
   - Phase completion percentages
   - Milestone statuses (pending / in-progress / done / blocked)
   - Active blockers with descriptions
   - Recent activity log
3. Does not invoke any agents — read-only view

**Example:**
```
/fd-dashboard
```

**What Next?**
1. Run `/fd-roadmap` to update phase statuses or add milestones
2. Run `/fd-progress` for a task-level view
3. Run `/fd-discuss` or `/fd-plan` for phases shown as blocked

---

## /fd-roadmap

**Description:** View or update the project roadmap. Shows all phases with their current statuses and lets you mark phases as complete or add new ones.

**Arguments:** None (interactive prompts guide updates)

**What it does:**
1. Reads and displays `.planning/ROADMAP.md` with phase names, statuses, and target dates
2. Prompts you to update any phase status or add new phases
3. Saves changes back to `.planning/ROADMAP.md`
4. Reflects changes in subsequent `/fd-dashboard` calls

**Example:**
```
/fd-roadmap
```

**What Next?**
1. Run `/fd-discuss N` to begin work on the next planned phase
2. Run `/fd-dashboard` to see the updated roadmap in context
3. Run `/fd-checkpoint` to save state after roadmap updates

---

## /fd-settings

**Description:** View or update FlowDeck configuration: model assignments per agent, guard enforcement, and workspace mode.

**Arguments:** None (interactive prompts guide configuration)

**What it does:**
1. Reads `.planning/config.json` and displays current settings
2. Presents configuration options:
   - **Model assignments** — which AI model handles each agent role (e.g. `@architect → claude-3-5-sonnet`)
   - **Guard enforcement** — whether security and review guards are mandatory or advisory
   - **Workspace mode** — `single` (one repo) or `multi` (multi-repo coordination enabled)
3. Saves changes to `.planning/config.json`

**Example:**
```
/fd-settings
```

**What Next?**
1. Run `/fd-multi-repo --list` to see registered repos if workspace mode is `multi`
2. Run `/fd-progress` to confirm settings are in effect
3. Run `/fd-new-feature` to use updated model assignments

---

## /fd-multi-repo

**Description:** Manages multi-repo configuration in `.planning/config.json`. Register, list, check status of, or remove service repositories for cross-repo coordination.

**Arguments:**
- `--add <path> <role>` — register a repository at the given path with the specified role
- `--list` — show all registered repositories and their roles
- `--status` — check git status across all registered repositories
- `--remove <name>` — remove a registered repository by name

**What it does:**
- `--add`: Resolves the path, detects tech stack, and appends an entry to `sub_repos` in `.planning/config.json`
- `--list`: Reads `sub_repos` and prints a formatted table of name, path, role, tech stack, and owner team
- `--status`: Runs `git status` in each registered repo and summarizes uncommitted changes and branch positions
- `--remove`: Removes the named entry from `sub_repos` in `.planning/config.json`

**Example:**
```
/fd-multi-repo --add ../user-service upstream-api
/fd-multi-repo --add ../order-service consumer
/fd-multi-repo --list
/fd-multi-repo --status
/fd-multi-repo --remove notification-service
```

**What Next?**
1. Run `@multi-repo-coordinator` with a cross-cutting change description to begin coordinated work
2. Run `/fd-multi-repo --status` before starting any cross-repo feature to check for diverged branches
3. Run `/fd-settings` to confirm workspace mode is set to `multi`

---

← [Back to Index](index.md)
