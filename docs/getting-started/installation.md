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

## FDX CLI Tools

FlowDeck includes `fdx`, a Rust-based CLI that provides token-optimized alternatives to native file operations. During installation, the installer builds and installs `fdx` via `cargo install`.

### Available fdx Commands

| Command | Purpose |
|---------|---------|
| `fdx-read` | Read files with smart chunking and diff-based updates |
| `fdx-grep` | Search file contents with context-aware output |
| `fdx-search` | Find files by glob patterns with metadata |
| `fdx-outline` | Extract symbol structure from source files |
| `fdx-diff` | Generate structured diffs between files or commits |
| `fdx-git` | Git operations with formatted output |
| `fdx-tree` | Directory tree listing with ignore support |
| `fdx-test` | Run test suites with result formatting |
| `fdx-lint` | Run linters with categorized output |

### Skipping fdx Installation

If you do not need the fdx CLI tools, set the environment variable before running the installer:

```bash
export FDX_SKIP=1
bash install.sh
```

### Requirements

- **Rust** — `cargo` must be available in your PATH. If missing, the installer can install Rust via rustup (with confirmation).
- **Build time** — First build takes 1–2 minutes depending on your system.

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
