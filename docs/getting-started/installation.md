# Installation

## Prerequisites

- [OpenCode](https://opencode.ai) or [Claude Code](https://code.claude.com/docs/en/overview) installed and configured
- Node.js 18+ (for npx installation)
- Git (for curl installation)

## OpenCode Install Methods

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

## Claude Code: load the native plugin

From a local FlowDeck checkout, validate the plugin and load it for one session:

```bash
claude --version
claude plugin validate ./integrations/claude-code
claude --plugin-dir ./integrations/claude-code
```

Run these commands from the FlowDeck repository root. The eight Claude Code skills
use namespaced names, for example `/flowdeck:fd-task` and
`/flowdeck:fd-status`. This local load does not install the plugin permanently;
leave the session and omit `--plugin-dir` to stop loading it. The plugin does not
edit your Claude Code settings, project `CLAUDE.md`, or credentials. Claude Code
may manage its own plugin metadata when installed through its plugin manager.

Node.js must be on the `PATH` Claude Code sees so its FlowDeck state and policy
hooks can run. FDX is optional; without it, commands use ordinary repository
inspection and must label graph or impact analysis as unavailable. The policy
hook is scoped to tool calls it observes. Disabled or unloaded hooks and commands
outside that scope are not protected by it; use your own Claude Code permissions
and sandbox for additional controls. Supported fail-closed hook handling requires
Claude Code 2.1.295 or newer.

Planning state is stored outside the repository at
`~/.fd-plan/<normalized-project-name>-<12-character-path-hash>/` for new workspaces.
The hash is calculated from the canonical repository path, so two projects with
the same directory name get different state. A prior basename-only directory is
reused only if its `STATE.md` identifies the same project by `project_root` or an
absolute `plan_file` inside that project. Unattributed legacy directories stay
untouched and are not migrated automatically. Use `/fd-status` to inspect the
active workspace before resuming older work.

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
| `fdx-tree` | Directory tree listing with ignore support |
| `fdx-ls` | Token-optimized directory listing |
| `fdx-impact` | Lightweight cross-file dependency analysis |
| `fdx-diff` | Symbol-aware git diff |
| `fdx-git` | Git operations with formatted output |
| `fdx-batch` | Read multiple files in one call |

Some fdx commands (`fdx-test`, `fdx-lint`) are thin wrappers around common test runners and linters. Run `fdx --help` for the full list.

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
| `FLOWDECK_STATE_DIR` | Directory for state files | `~/.fd-plan/` |
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
