# Installation

## Prerequisites

- [OpenCode](https://opencode.ai) installed and configured
- Node.js 18+ (for npx installation)
- Git (for curl installation)

## Install Methods

### Method 1: curl (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/DVNghiem/flowdeck/main/install.sh | bash
```

This downloads and runs the official installer script. It clones the repository and runs the post-install setup.

### Method 2: npx

```bash
npx @dv.nghiem/flowdeck install
```

No git required. Uses npx to fetch and install the package directly.

## Verify Installation

Run the health check command:

```bash
flowdeck doctor
```

Expected output shows FlowDeck version, OpenCode plugin status, and environment health.

Alternatively, verify the binary is in your path:

```bash
which flowdeck
```

## Post-Installation

After installation, FlowDeck registers as an OpenCode plugin. Restart OpenCode to load the plugin and its commands.

## Optional: rtk Output Compression

[rtk](https://github.com/rtk-ai/rtk) is a CLI proxy that compresses noisy terminal output (git, npm, test runners, linters) by 60–90% before it reaches the model context. It is optional but recommended for token savings on command-heavy workflows.

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

FlowDeck detects rtk automatically. No configuration needed. Once installed:

- `RTK_INSTALLED=true` and `RTK_BIN=<path>` are injected into every bash session
- `RTK_TELEMETRY_DISABLED=1` is always set (FlowDeck disables rtk telemetry by default)
- Agents can use `$RTK_BIN git status`, `$RTK_BIN npm test`, etc. for compressed output
- Call `rtk-setup` (action: `"init"`) once to install the bash auto-rewrite hook

See [rtk Integration reference](../reference/rtk.md) for full setup, supported commands, and telemetry details.

---

## Environment Variables

FlowDeck respects the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `FLOWDECK_CONFIG` | Path to flowdeck.json config | `./flowdeck.json` |
| `FLOWDECK_STATE_DIR` | Directory for state files | `.planning/` |
| `OPENCODE_MODEL` | Model to use when not overridden | (OpenCode default) |

## Uninstall

### Method 1: npm

```bash
npm uninstall -g @dv.nghiem/flowdeck
```

### Method 2: Run uninstall script

If you used the curl installer:

```bash
./uninstall.sh
```

This removes the plugin from OpenCode and cleans up installed files.
