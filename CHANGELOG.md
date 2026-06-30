# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0-alpha.9] - 2026-06-30

### Added
- `fdxToolPermissions` enforcement across agent definitions to gate tool usage based on fdx availability.
- Grep functionality now supports context lines and max-matches limits with improved output handling.

### Changed
- Removed `fdxToolPermissions` from agent definitions after the guard was moved to a central hook.

## [0.6.0-alpha.8] - 2026-06-29

### Changed
- Updated package version to 0.6.0-alpha.8.
- Updated documentation and command references to reflect the current agent count and available skills.
- Removed `fd-quick` from registered commands and its associated tests.

### Added
- Added fdx uninstallation logic with skip conditions to `uninstall.sh`.
- Added FDX redirect guard that blocks native read/search tools when fdx tools are available.

## [0.6.0-alpha.7] - 2026-06-28

### Changed
- Updated package version to 0.6.0-alpha.7.

### Fixed
- fdx binary check now uses `help` instead of `version` for better compatibility.

### Removed
- Removed outdated planning documents from the codebase.

### Added
- Enhanced command handling and added `fd-quick` workflow launcher.

## [0.6.0-alpha.6] - 2026-06-27

### Changed
- Updated package version to 0.6.0-alpha.6.
- Refreshed orchestrator prompt tests for clarity and consistency.
- Removed outdated router-dispatch and workflow-router service tests.
- Simplified fdx installation success messages.
- Reorganized fdx installation and plugin registration in `install.sh`.

### Added
- TDD enforcement guard that blocks production code writes without a failing test.
- Added initialization command and improved workspace-check error messages.
- Enhanced documentation and tests for ultrawork state and preferred tools.

### Changed
- Refactored orchestrator and related commands.

## [0.6.0-alpha.5] - 2026-06-24

### Changed
- Updated package version to 0.6.0-alpha.5.
- Simplified `install.sh` by removing unused features.

### Added
- Added `/fd-ultrawork` command documentation and updated README/index references.
- Added `fd-ultrawork` command with a detailed execution workflow.
- Added verification layer for structured event logging.

### Fixed
- Orchestrator guard now blocks only the orchestrator when `toolInput.agent` is present.
- Guard now allows executor writes when the plan is confirmed.
- Improved routing and handoff instructions in the orchestrator prompt.

## [0.6.0-alpha.4] - 2026-06-22

### Changed
- Updated package version to 0.6.0-alpha.4.

### Added
- Added `/fd-ultrawork` command with detailed execution workflow and command registry integration.
- Added verification layer for structured event logging.

### Security
- Bumped `actions/checkout` in the GitHub Actions group.

## [0.6.0-alpha.3] - 2026-06-18

### Changed
- Updated package version to 0.6.0-alpha.3.
- Removed event-logging hooks and related functionality.
- Updated agent descriptions, classifications, and tier mappings.

### Added
- `planning-state` tool now supports the `write_plan` action with plan persistence tests.
- Enhanced shell command classification with new blocked tools and mutating prefixes.
- Integrated `sessionEventsHook` and `toolGuardHook` into the plugin.
- Added routing types and tests.

### Fixed
- Updated `args` type in `makeEventLogStub` to `Record<string, unknown>`.

## [0.6.0-alpha.1] - 2026-06-16

### Changed
- Updated package version to 0.6.0-alpha.1.
- Removed dead decision-trace and reflect references; cleaned orchestrator contract and guard.
- Generated orchestrator routing options dynamically from agent files.
- Rewrote orchestrator prompt for the evaluate-discuss-route-self-correct flow.
- Replaced `context-ingress` with a lean session-start loader.
- Simplified `src/index.ts` to under 200 lines.
- Removed non-core services, tools, dashboard, and hooks.
- Added token-optimization rules to every agent prompt.

### Added
- Wired `capture-lesson`, `review-lessons`, and `/fd-retrospective` learning flow.
- Failure learning with in-session memory and cross-session lessons.
- Write-limit guard to stop agents exceeding per-session file budgets.
- Handoff-protocol tests and execution-substrate validation.
- Comprehensive tests for task classification, tool selection, and planning state resolution.

### Fixed
- Updated governance property type in `FlowDeckConfig` to use `GovernanceConfig`.

## [0.6.0-alpha.0] - 2026-06-15

### Changed
- Updated package version to 0.6.0-alpha.0.
- Updated publish workflow to include alpha, beta, and rc tag patterns.
- Added GitHub Sponsors username to `FUNDING.yml`.

## [0.6.0] - 2026-06-15

### Changed
- Released version 0.6.0.
- Cached rule/language detection to reduce per-command filesystem scans.

### Added
- tmux subagent visibility tools.
- `/fd-init-deep` command for AGENTS.md hierarchy generation.
- Ultrawork autonomous loop mode.
- Background subagent execution with poll/check tools.
- Per-agent model configuration via `.flowdeck.jsonc`.

### Fixed
- Allowed `task` tool in orchestrator, enabled dynamic agent list, and added self-correction rule.

## [0.5.0] - 2026-06-15

### Added
- Delegation budget service and context ingress service.

[Unreleased]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.9...HEAD
[0.6.0-alpha.9]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.8...0.6.0-alpha.9
[0.6.0-alpha.8]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.7...0.6.0-alpha.8
[0.6.0-alpha.7]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.6...0.6.0-alpha.7
[0.6.0-alpha.6]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.5...0.6.0-alpha.6
[0.6.0-alpha.5]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.4...0.6.0-alpha.5
[0.6.0-alpha.4]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.3...0.6.0-alpha.4
[0.6.0-alpha.3]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.1...0.6.0-alpha.3
[0.6.0-alpha.1]: https://github.com/DVNghiem/flowdeck/compare/0.6.0-alpha.0...0.6.0-alpha.1
[0.6.0-alpha.0]: https://github.com/DVNghiem/flowdeck/compare/0.6.0...0.6.0-alpha.0
[0.6.0]: https://github.com/DVNghiem/flowdeck/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/DVNghiem/flowdeck/compare/0.4.12...0.5.0
