# rtk Integration

FlowDeck integrates [rtk](https://github.com/rtk-ai/rtk) — a Rust CLI proxy that compresses noisy terminal output (git, npm, test runners, linters, Docker, and more) by 60–90% before it reaches the model context.

---

## What rtk does

rtk acts as a transparent proxy in front of supported CLI commands:

```bash
rtk git status     # same as git status, but output compressed 60-90%
rtk npm test       # same as npm test, but noise filtered out
rtk tsc --noEmit   # TypeScript compiler errors, signal-only
```

This reduces the number of tokens consumed by verbose CLI output — lowering cost and improving signal quality for agents that read shell output.

---

## Detection

FlowDeck detects rtk automatically at session startup. No configuration is required.

Detection checks in order:
1. `rtk --version` via `PATH`
2. `~/.local/bin/rtk` (default install location on Linux/macOS)
3. `/usr/local/bin/rtk`

Detection is performed once per session and cached (zero overhead per bash call).

---

## Environment Variables Injected

When rtk is detected, FlowDeck injects the following into **every bash tool execution** via the `shell.env` hook:

| Variable | Value | Description |
|----------|-------|-------------|
| `RTK_INSTALLED` | `"true"` / `"false"` | Whether rtk was found at session start |
| `RTK_BIN` | e.g. `/home/user/.local/bin/rtk` | Full path to the rtk binary (only when installed) |
| `RTK_TELEMETRY_DISABLED` | `"1"` | Always set when rtk is installed — blocks telemetry |

Agents can use these vars directly in bash commands:

```bash
if [ "$RTK_INSTALLED" = "true" ]; then
  $RTK_BIN git log --oneline -20
else
  git log --oneline -20
fi
```

---

## Telemetry

FlowDeck **always disables rtk telemetry**. Two layers of protection:

1. **`rtk telemetry disable`** — run automatically after every `rtk-setup init`. Stores an explicit opt-out in rtk's local config (`~/.local/share/rtk/`).
2. **`RTK_TELEMETRY_DISABLED=1`** — injected into every bash session by FlowDeck's `shell.env` hook. Blocks telemetry at the env-var level regardless of stored consent state.

Both mechanisms are active independently. The env var alone is sufficient to suppress all telemetry pings even if the config opt-out is somehow lost.

See [rtk TELEMETRY.md](https://github.com/rtk-ai/rtk/blob/develop/docs/TELEMETRY.md) for what rtk would collect if telemetry were enabled.

---

## Supported Commands

The following commands benefit from rtk compression. FlowDeck's wrapping policy (`rtk-policy.ts`) uses this list:

| Command | What gets compressed |
|---------|----------------------|
| `git status` | Staged / unstaged file listing |
| `git log` | Commit history |
| `git diff` | Full diff output |
| `git show` | Commit show output |
| `npm test` / `bun test` | Test runner output and summaries |
| `tsc` | TypeScript compiler diagnostics |
| `eslint` / `biome` / `oxlint` | Lint output |
| `jest` / `vitest` / `pytest` | Test output |
| `cargo` | Rust build / test output |
| `docker` | Container and image listings |
| `kubectl` | Kubernetes resource listings |
| `gh` | GitHub CLI output |
| `pnpm` / `yarn` / `npx` | Package manager output |

**Commands that are never wrapped** (raw output required or already compact):

| Command | Reason |
|---------|--------|
| `git rev-parse` | Returns a single hash — already minimal |
| `git diff --name-only` / `--name-status` / `--stat` | Already compact listing |
| `git ls-files`, `git config`, `git symbolic-ref` | Compact structured output |
| `codegraph` | Programmatic structured output — must not be modified |
| `curl` | Used for downloads — raw output required |
| `sh`, `bash`, `node`, `python` | Shell interpreters — must not be intercepted |

---

## Setup Tool

Agents can check rtk status or trigger initialization via the `rtk-setup` tool:

### Check status

```
rtk-setup (action: "status")
```

Returns current detection result, binary path, version, and instructions if rtk is not installed.

### Initialize bash hook

```
rtk-setup (action: "init")
```

Runs `rtk init -g` to install the bash rewriting hook, then immediately runs `rtk telemetry disable`. Reports both outcomes.

**Bash hook caveat:** `rtk init -g` writes to Claude Code / Copilot global config. Whether the hook fires automatically in OpenCode's non-interactive bash sessions depends on the runtime. Using `$RTK_BIN <cmd>` explicitly is always reliable.

---

## Installing rtk

FlowDeck does **not** auto-install rtk. Auto-executing a remote shell script is a supply-chain risk. Install manually:

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

After installation, add `~/.local/bin` to your PATH if not already present, then verify:

```bash
rtk --version
```

FlowDeck will detect the binary automatically on the next session start.

---

## No rtk? No problem.

rtk is entirely optional. If rtk is not installed:
- `RTK_INSTALLED=false` is injected (no `RTK_BIN` or `RTK_TELEMETRY_DISABLED`)
- All commands run as normal — no change to behavior
- The `rtk-setup` tool returns install instructions instead of status
- All FlowDeck workflows remain fully functional

---

## Files

| File | Purpose |
|------|---------|
| `src/services/rtk-manager.ts` | Detection (`detectRtk`), init (`initRtk`), status (`getRtkStatus`), wrapping (`wrapCommandArgs`) |
| `src/services/rtk-policy.ts` | Command wrapping policy — supported list, compact-git exclusions, `shouldWrapWithRtk()` |
| `src/tools/rtk-setup.ts` | Agent-callable `rtk-setup` tool |
| `src/hooks/shell-env-hook.ts` | Injects `RTK_INSTALLED`, `RTK_BIN`, `RTK_TELEMETRY_DISABLED` into bash sessions |
