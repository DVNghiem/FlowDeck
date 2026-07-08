# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Auto-update loader pattern: `src/index.ts` is now a thin loader that checks npm registry, runs `npm update`, git-pulls the repo clone, rebuilds, and loads the real plugin from `~/.local/share/flowdeck/dist/`. Falls back to bundled plugin at `src/plugin/index.ts`. (plugin-loader service)
- Dual build: `bun run build` now produces both `dist/index.js` (loader) and `dist/plugin/index.js` (bundled plugin).
- Plugin loader tests: 16 tests covering checkNpmRegistry, ensureRepoClone, buildPlugin, and loadPluginFromRepo.

### Changed
- Plugin factory moved from `src/index.ts` to `src/plugin/index.ts` (exact copy, imports adjusted for new path).
- Session-start hook cleaned up: removed update-checker call (now handled by the loader factory) and associated context fields.

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

[0.6.0]: https://github.com/DVNghiem/flowdeck/compare/0.4.12...0.6.0
