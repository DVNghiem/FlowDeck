# Changelog

## 0.6.0

### Breaking
- Skips 0.5.x (unstable). Fresh start from 0.4.12 baseline.
- All 0.5.x versions deprecated on npm.

### Fixed
- Orchestrator guard now allows `task` tool — native @agent delegation works.
- Guard message shows all agents dynamically, not hardcoded list.
- Orchestrator self-corrects on guard blocks instead of reporting "blocked".

### Added
- Background subagent execution (`background-agent`, `check-background-agent`, `list-background-agents`).
- Ultrawork autonomous loop mode (`/fd-ultrawork`, `FLOWDECK_ULTRAWORK=on`).
- `/fd-init-deep` command for hierarchical AGENTS.md generation.
- Per-agent model configuration via `.flowdeck.jsonc`.
- Tmux subagent visibility (`tmux-watch`, `tmux-dashboard`).

### Performance
- Rule/language detection cached per project root — reduces token overhead.
