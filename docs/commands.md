# FlowDeck Commands

Commands are slash commands registered in OpenCode. Run them by typing `/command-name [arguments]` in any OpenCode session.

## Quick Reference

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/fd-new-project` | `[project-name]` | Initialize project with planning structure and default config |
| `/fd-new-feature` | `[feature-description]` | Define a new feature and initialize feature context |
| `/fd-discuss` | `[topic]` | Structured Q&A to capture decisions for a phase |
| `/fd-plan` | `[--phase=N]` | Generate detailed implementation plan from decisions |
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
| `/fd-quick` | `[task description]` | Quick focused task with automatic agent selection |
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
1. Run `/fd-execute` to implement the plan
2. Run `/fd-plan --phase=2` for next phase

---

## /fd-execute

**Description:** Implement the current phase's plan using TDD discipline with parallel agents. This is the execution step after planning is confirmed.

**Arguments:**
- `[--phase=N]` — target specific phase
- `[--override]` — bypass guards and proceed anyway

**What it does:**
1. Reads `.planning/phases/phase-N/PLAN.md` for implementation steps
2. For each step, enforces TDD cycle: BEHAVIOR → RED → GREEN → REFACTOR
3. `@tester` writes failing tests first
4. `@coder` implements minimum to pass
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
3. `@coder` implements minimum to pass
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
3. `@coder` implements minimum fix (GREEN)
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

**Description:** Execute a focused task without the full workflow. Selects best specialist agent automatically.

**Arguments:**
- `[task description]` — what you need done

**Agent Selection Matrix:**

| Task Type | Agent |
|-----------|-------|
| Write/edit code | @coder |
| Explore/understand | @code-explorer |
| Review code | @reviewer |
| Security review | @security-auditor |
| Design/architecture | @architect |
| Write tests | @tester |
| Documentation | @doc-updater |
| Research | @researcher |
| Debug | @debug-specialist |
| Performance | @performance-optimizer |
| Build error | @build-error-resolver |

**Example:**
```
/fd-quick find where the session token is validated
/fd-quick add rate limiting to the API
```

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