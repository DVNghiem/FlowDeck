# FlowDeck Installation

This guide covers all three ways to install FlowDeck, how to verify the installation, how to keep it up to date, and how to remove it cleanly.

---

## Prerequisites

Before installing FlowDeck, ensure the following tools are available:

| Requirement | Minimum version | Check command |
|-------------|----------------|---------------|
| OpenCode | 1.0 | `opencode --version` |
| Node.js | 18 | `node --version` |
| npm | 9 | `npm --version` |

If OpenCode is not yet installed, follow the [OpenCode installation guide](https://opencode.ai/docs) before continuing.

---

## Method 1: curl (recommended)

The install script downloads the latest release, copies all agents, skills, commands, and workflows to `~/.config/opencode/`, and registers `@dv.nghiem/flowdeck` as a plugin in `opencode.json`.

```bash
curl -fsSL https://raw.githubusercontent.com/DVNghiem/flowdeck/main/install.sh | bash
```

What the script does:

1. Detects your config directory (`$OPENCODE_CONFIG_DIR` or `~/.config/opencode`)
2. Copies `agents/*.md` → `~/.config/opencode/agent/` (markdown agents for OpenCode compatibility)
3. Compiles TypeScript agents from `src/agents/` → `dist/agents/` (for plugin-based loading)
4. Copies `skills/*/` → `~/.config/opencode/skills/`
5. Registers `@dv.nghiem/flowdeck` as a plugin in `opencode.json`
6. Sets `orchestrator` as the default agent

---

## Method 2: npx (no git required)

If you prefer not to clone the repository, run FlowDeck's bundled installer directly through npm:

```bash
npx @dv.nghiem/flowdeck install
```

This fetches the latest published package from the npm registry and runs the same installation steps as the curl method.

---

## Method 3: Manual

Use the manual method when you want to inspect or modify the source before installing, or when you need to install from a specific branch or fork.

```bash
git clone https://github.com/DVNghiem/flowdeck
cd flowdeck
npm install && npm run build
bash install.sh
```

Steps explained:

- `npm install` — fetches Node.js dependencies
- `npm run build` — compiles TypeScript source in `src/` to `dist/`
- `bash install.sh` — copies built assets to `~/.config/opencode/` and updates `opencode.json`

---

## Verification

After any install method, run these commands to confirm everything landed correctly:

```bash
# Should print 23 or more
ls ~/.config/opencode/agent/ | grep -c "\.md"

# Should list 24 or more directories
ls ~/.config/opencode/skills/

# Should list 16 or more files
ls ~/.config/opencode/command/

# Should print @dv.nghiem/flowdeck
cat ~/.config/opencode/opencode.json | grep flowdeck
```

Expected output for the last command:

```
"@dv.nghiem/flowdeck"
```

If any count is lower than expected, re-run the install command. If the `opencode.json` line is missing, the plugin will not load — add it manually (see [Configuration](configuration.md)).

---

## Updating FlowDeck

### curl method

Re-running the install script downloads and applies the latest version:

```bash
curl -fsSL https://raw.githubusercontent.com/DVNghiem/flowdeck/main/install.sh | bash
```

The script overwrites existing FlowDeck files and updates the plugin cache.

### npm method

```bash
npm update -g @dv.nghiem/flowdeck && npx @dv.nghiem/flowdeck install
```

---

## Uninstalling

```bash
bash uninstall.sh
```
You can also add the `--local` flag to uninstall from a local project `.opencode/` directory instead of the global config.

The uninstall script automatically scans the FlowDeck package and safely removes any installed agents, skills, and commands from your OpenCode config directory. It does not delete your project's `.planning/` directory or any state files.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_CONFIG_DIR` | `~/.config/opencode` | Override the directory where FlowDeck installs agents, skills, and commands |
| `XDG_CONFIG_HOME` | `~/.config` | Standard XDG base directory; used when `OPENCODE_CONFIG_DIR` is not set |

Set `OPENCODE_CONFIG_DIR` before running the install script to place FlowDeck files in a non-default location:

```bash
OPENCODE_CONFIG_DIR=/custom/path bash install.sh
```

---

← [Back to Index](index.md)
