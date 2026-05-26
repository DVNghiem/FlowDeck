# OpenCode Integration Settings

FlowDeck integrates with OpenCode as a plugin. This page explains how the plugin is registered, what gets published as an npm package, and what environment variables FlowDeck reads at runtime.

---

## Plugin Registration

FlowDeck uses the `@opencode-ai/plugin` package to register itself with OpenCode. After running `npm install @dv.nghiem/flowdeck`, the `postinstall` script (`postinstall.mjs`) automatically:

1. Reads the OpenCode global config at `~/.config/opencode/opencode.json` (or `$OPENCODE_CONFIG_DIR/opencode.json`)
2. Adds `"@dv.nghiem/flowdeck"` to the `plugin` array if not already present
3. Sets `"default_agent": "orchestrator"` if not already set
4. Writes the updated config back to disk

OpenCode loads all plugins listed in the `plugin` array on startup.

---

## Package Contents

The `package.json` `files` field controls what gets published as the npm package:

```
files:
  dist/         — compiled plugin code
  bin/          — CLI entry point
  src/commands/ — command implementations
  src/rules/    — coding standards
  src/skills/   — skill definitions
  docs/         — documentation
  postinstall.mjs — post-install registration script
```

The npm package does **not** include `src/agents/`, `src/tools/`, `src/hooks/` (with the exception of `src/skills/`), or development files.

---

## Plugin Architecture

FlowDeck registers its capabilities through the following source directories:

### `src/agents/`

Agent definitions. Each agent specifies its role, allowed tools, instructions, and delegation policies.

### `src/tools/`

Tool definitions. These extend OpenCode's tool set with FlowDeck-specific capabilities.

### `src/hooks/`

System hooks that react to OpenCode lifecycle events:

| Hook File | When It Fires | Purpose |
|-----------|---------------|---------|
| `session-start.ts` | `session.created` | Loads prior state from `.planning/STATE.md` and injects phase/status/steps into context |
| `compaction-hook.ts` | `experimental.session.compacting` | Injects structured planning context before context window compaction |
| `shell-env-hook.ts` | Every `bash` tool execution | Injects `FLOWDECK_VERSION`, `PROJECT_ROOT`, `PACKAGE_MANAGER`, `DETECTED_LANGUAGES`, `FLOWDECK_PHASE` env vars |
| `context-window-monitor.ts` | `message.updated`, `tool.execute.after` | Warns when context usage exceeds 70% of the token limit |
| `session-idle-hook.ts` | `session.idle` (when files edited) | Sends desktop notification and logs edited file summary |
| `notifications.ts` | Various | Desktop notification dispatch |
| `file-tracker.ts` | During session | Tracks edited file paths across agent turns |

### `src/skills/`

Skill definitions exported via the plugin's skill registration API. Skills expose reusable workflow patterns (TDD, security scan, code review, etc.) to OpenCode's skill system.

---

## Environment Variables

FlowDeck reads the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_CONFIG_DIR` | `~/.config/opencode` | OpenCode configuration directory |
| `XDG_CONFIG_HOME` | `~/.config` | Used to derive `OPENCODE_CONFIG_DIR` if not set |
| `FLOWDECK_CONTEXT_LIMIT` | `200000` | Token limit for context window monitor (used by `context-window-monitor.ts`) |

FlowDeck does **not** read any API keys, tokens, or secrets. All model authentication is handled by OpenCode.

---

## opencode.json Schema (Plugin Section)

After installation, your `opencode.json` looks like:

```json
{
  "plugin": [
    "@dv.nghiem/flowdeck"
  ],
  "default_agent": "orchestrator"
}
```

FlowDeck's plugin reads the top-level keys described in [Configuration](index.md) (`agents`, `governance`, `model_profile`, etc.) from this same file.
