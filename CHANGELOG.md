# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0-alpha.1] - 2026-07-31

### Added
- **`fdx graph` command suite** — fully replaces `codegraph` as the default code intelligence backend:
  - `fdx graph build` — index the codebase into a local SQLite knowledge graph
  - `fdx graph query` — run Cypher queries against the graph
  - `fdx graph report` — show build status and warnings
  - `fdx graph deps/path/explain` — dependency and call-path analysis
  - `fdx graph impact/status` — symbol impact radius analysis
  - All agents now use `fdx-graph` tool; bare symbol names resolve correctly
  - Build warnings are persisted; agent files excluded from indexing
- **Artifact validation** — checks run across `fd-execute`, `fd-review`, `fd-task` to ensure generated artifacts are valid
- **Skill permission registry** — `skillGates` integrated per-agent; permissions gate which skills an agent may invoke
- **`context-steward-triggers` skill** — manages context health thresholds, proactively triggers cleanup when memory pressure is high

### Changed
- **`fdx` installation is now version-aware** — both `install.sh` and `postinstall.mjs` detect when the installed binary is stale vs `crates/fdx/Cargo.toml`, and prompt to rebuild
- **Tool guard `fdx` redirect split into its own flag** — `FDX_REDIRECT_ENABLED` is now independent of the main guard enable/disable, so test mode bypasses the redirect cleanly without breaking phase-enforcement tests
- **Token optimization block extracted** as a shared prompt fragment — deduplicated and reused across all agent contracts
- **Worktree naming convention** — renamed `phase` to `wave` throughout documentation and test fixtures
- Orchestrator prompt now includes a "Graph Usage" section; `codegraph` references dropped

### Refactored
- All agents, mapper, and orchestrator now point to `fd-graph` instead of `codegraph`
- Legacy lessons migrated to a global file; lesson handling updated in session-start hook
- Stale command documentation reverted to match runtime behavior
- Obsolete issue documentation removed (prompt surgery, context retention)
- `VERSION` file removed (no longer needed)
- `fd-task.md` clarified on research process and user interaction flows

### Removed
- `code-tour` skill documentation
- Deprecated skills, related tests, and documentation fixtures
- `codebase-state` tests and related functionality

### Fixed
- Rust bug in `fdx` `repair` that voided most error returns (addressed in code review)
- Symbol and import extraction via tree-sitter queries
- Skill count corrected from 41 to 42 in `README.md` and `docs/index.md`
- Worktree naming corrected in documentation (`phase` → `wave`)
- Agent behavior and error handling enhanced across commands

### Tests
- Coverage added for prompt fragment and contract registry
- Read-after-migration end-to-end coverage added with documentation
- `.gitkeep` fixtures added to validator skill directories

### Documentation
- All docs now point to `fdx-graph` instead of `codegraph`
- Deferred follow-ups from the `fdx-graph` engineering review recorded
- Context health checks and proactive management guidelines added to orchestrator docs
- Token efficiency rules added to orchestrator, coder, and `fd-task` documentation
- Behavioral guidelines refined in agent orchestration docs
- Synced `README.md`, `docs/index.md`, `mkdocs.yml`, `docs/commands/**` to match runtime: removed 18 ghost `docs/commands/*.md` files for non-existent commands, retained the 8 shipping commands (`fd-task`, `fd-review`, `fd-execute`, `fd-verify`, `fd-done`, `fd-checkpoint`, `fd-resume`, `fd-status`), corrected counts (8 commands, 42 skills, 12 agents), and replaced stale `.planning/` references with `~/.fd-plan/<slug>/`

### Changed
- **`.codebase/` storage moved to `~/.fd-plan/<slug>/.codebase/`.** On the
  first call to the `codebase-state` tool for a given project, a one-time
  migration lifts every file under the legacy `<repo>/.codebase/` directory
  into `~/.fd-plan/<basename(directory)>/.codebase/`. The migration uses
  `fs.renameSync` (atomic on the same filesystem) and writes a
  `MIGRATION.jsonl` marker listing each file it has moved; subsequent
  processes re-read that marker so a second FlowDeck process never
  re-migrates or overwrites a file the first process already placed at
  the new path. The on-disk schema is unchanged — file names and JSONL /
  markdown bodies are preserved verbatim.
- **Symlinked legacy `.codebase/` directories are realpath'd, moved, and
  unlinked.** If the legacy `<repo>/.codebase/` was a symlink, the
  migration moves the real target into the new location and then removes
  the symlink so the user does not see a dangling pointer at the old
  path. The realpath step happens before the move to avoid `readdirSync`
  silently following the symlink and leaving a phantom directory behind.
- **BREAKING: per-project scoping.** A repository that was previously
  shared across multiple FlowDeck projects (because the legacy
  `<repo>/.codebase/` was keyed by repo path only) is now scoped per
  `<slug>` — each `basename(directory)` gets its own
  `~/.fd-plan/<slug>/.codebase/`. If you operate the same repo from two
  different project directories, each will get its own codebase storage.
- **All FlowDeck artifacts now resolve through `codebaseDir()`.** The
  repo-memory, audit-log, run-trace, verification-layer, guard-rails,
  session-start, tool-guard, research-gate, impact-radar, and codegraph
  modules now derive their file paths from `codebaseDir(directory,
  filename?)` instead of hard-coding `<repo>/.codebase/...`.

### Added
- `scripts/validate-docs.mjs`: a docs-vs-runtime guard that fails on missing commands, command/skill/agent count drift, command-directory parity, broken relative links, and `VERSION`/`package.json.version` parity.
- `tests/tools/validate-docs.test.ts` with six on-disk fixtures: `ok`, `bad-count`, `bad-link`, `bad-state-path`, `bad-parity`, `bad-version`.
- A CI step in `.github/workflows/ci.yml` that runs the validator on every push and PR.

## [0.7.0.2] - 2026-07-24

### Changed
- **`fdx-context` and `fdx-decisions` moved to Rust.** Logic now lives in the `fdx` binary alongside the other 12 subcommands. New Rust modules: `paths.rs` (canonical topic path helpers + `slugify_topic`), `locking.rs` (file-level advisory locks matching TS `appendWithLock` exactly — 1s acquire timeout, unlocked fallback with stderr warning), `commands/context.rs` and `commands/decisions.rs`. Tool surface and LLM-facing output strings are unchanged.

## [0.7.0] - 2026-07-24

### Added
- **`fdx-context` tool**: per-topic append/read/clear log of subagent output. Each entry is `[<ISO timestamp>] [<stage>/<agent>] <summary>`, capped at 2000 chars with truncation marker. Per-topic advisory lock prevents concurrent-append races between subagents.
- **`fdx-decisions` tool**: per-topic design-decision log. Each entry is a `## <decision>` block with rationale, made_by, and ISO timestamp. Markdown-injection guard strips `\r\n\0` from user-supplied fields to keep blocks single-line.
- **`fdx-validate` tool**: pre-execute consistency check for topic artifacts. Validates `task.md` / `affect.md` / `plan.md` exist, parses `affect.md`'s `## Affected Files` section (recognizes `create` / `modify` / `delete` verbs, skips code-fenced lines and HTML comments, refuses `..` path traversal), and checks that `plan.md` mtime >= `task.md` mtime.
- **`fdx-worktree` tool**: typed `git worktree` wrapper. Five actions: `create` (3-way create-path logic — refuses non-empty unregistered dirs without `--force`-deleting user data), `list` (parses porcelain output), `merge` (clean-target preflight + conflict detection via `git diff --diff-filter=U` + automatic `git merge --abort` to leave the repo clean), `cleanup` (resolved-path cwd-containment guard), `cleanup-all` (snapshot-once-per-the-review, per-entry failure reporting with skipped/failed breakdown).
- Two new path helpers in `planning-state-lib.ts`: `topicContextPath`, `topicDecisionsPath`.
- Three new FS helpers: `readOrMissing`, `appendWithMkdir`, `clearFile`.
- One new lock-aware helper: `appendWithLock` (per-topic `.lock` file, 5s stale-lock detection, explicit stderr-logged fallback to unlocked append on contention timeout).
- New `clearFileWithLock` for atomic clear under the same lock.

### Changed
- Orchestrator prompt: added 4 new tools to the Tool Permissions list, plus an "Observability hooks" section that instructs the LLM to log-and-continue on `fdx-context` append failures (observability is not control flow).
- `planning-state-lib.ts` extended with new helpers and lock primitives; pre-existing functions untouched.

### Fixed
- **`fdx-worktree.list`**: now correctly extracts `topic` and `phase` from worktree path basenames (previously returned `topic: null` due to a regex mismatch with the actual path format).
- **`appendWithLock`**: replaced the busy-wait spin loop with explicit lock-state polling, added 5-second stale-lock detection to prevent permanent block on crashed appends, and made the 1-second timeout fallback explicit (logs to stderr instead of silently dropping the lock).

## [0.6.1] - 2026-07-13

### Added
- Added `formatContextPacket` function to build orchestrator context for task delegation and subagent context injection.
- Added guidelines for handling orchestrator context in task descriptions across multiple agents.

### Changed
- Updated blast radius message in `formatContextPacket` for clarity.

### Documentation
- Added detailed documentation for `fd-init-deep`, `fd-merge-assist`, and `fd-retrospective` commands.
- Updated README to reflect changes in agent count, features, and governance layer details.

## [0.6.0] - 2026-07-01

### Added
- Added Rust `fdx` CLI binary with `fdx-read`, `fdx-grep`, `fdx-search`, `fdx-outline`, `fdx-tree`, `fdx-ls`, `fdx-impact`, `fdx-diff`, `fdx-git`, and `fdx-batch` tools.
- FDX redirect guard, installation/uninstallation scripts, and binary health checks.
- `/fd-ultrawork` command for autonomous maximum-effort workflows.
- Background subagent execution with poll/check tools.
- `/fd-init-deep` command for AGENTS.md hierarchy generation.
- tmux subagent visibility tools.
- Per-agent model configuration via `.flowdeck.jsonc`.
- TDD enforcement guard that blocks production code writes without a failing test.
- Write-limit guard to stop agents exceeding per-session file budgets.
- `planning-state` tool with `write_plan` action and plan persistence tests.
- `capture-lesson`, `review-lessons`, and `/fd-retrospective` learning flow with in-session and cross-session failure learning.
- Dynamic orchestrator routing generated from the agent registry.
- Token-optimization rules added to every agent prompt.
- Routing types and tests.
- Shell command classification with blocked tools and mutating prefixes.
- Verification layer for structured event logging.
- `sessionEventsHook` and `toolGuardHook` integration into the plugin.
- Grep functionality with context lines and max-matches limits.
- Improved output handling for FDX search results.

### Changed
- Rewrote orchestrator prompt for the evaluate-discuss-route-self-correct flow and improved routing/handoff instructions.
- Refactored orchestrator and related commands.
- Simplified `src/index.ts` to under 200 lines.
- Removed non-core services, dashboard, hooks, and outdated planning documents from the codebase.
- Replaced `context-ingress` with a lean session-start loader.
- Cached rule/language detection to reduce per-command filesystem scans.
- Simplified and reorganized `install.sh`.
- Updated documentation and command references to reflect the current agent count and available skills.
- Updated agent descriptions, classifications, and tier mappings.
- Refreshed orchestrator prompt tests.
- `makeEventLogStub` `args` type updated to `Record<string, unknown>`.
- `FlowDeckConfig` governance property type updated to `GovernanceConfig`.

### Removed
- Removed `fd-quick` from registered commands and its associated tests.
- Removed outdated router-dispatch and workflow-router service tests.
- Removed dead decision-trace and reflect references.
- Removed event-logging hooks and related functionality.

### Fixed
- Orchestrator guard now blocks only the orchestrator when `toolInput.agent` is present.
- Guard now allows executor writes when the plan is confirmed.
- Allowed `task` tool in orchestrator, enabled dynamic agent list, and added self-correction rule.
- fdx binary check now uses `help` instead of `version` for better compatibility.

### Security
- Bumped `actions/checkout` in the GitHub Actions group.

## [0.5.X] - 2026-06-15 - unstable

### Added
- Delegation budget service and context ingress service.

[0.7.0-alpha.1]: https://github.com/DVNghiem/flowdeck/compare/0.6.1...0.7.0-alpha.1
[0.7.0.2]: https://github.com/DVNghiem/flowdeck/compare/0.7.0...0.7.0.2
[0.7.0]: https://github.com/DVNghiem/flowdeck/compare/0.6.1...0.7.0
[0.6.1]: https://github.com/DVNghiem/flowdeck/compare/0.6.0...0.6.1
[0.6.0]: https://github.com/DVNghiem/flowdeck/compare/0.4.12...0.6.0
