# System Hooks Reference

FlowDeck implements deep system hooks that react to OpenCode lifecycle events. These hooks maintain session state, inject environment context, monitor resource usage, and send notifications without requiring any explicit commands.

---

## Hooks Overview

| Hook | Fires On | Purpose |
|------|----------|---------|
| `session-start` | `session.created` | Loads and injects prior planning state into the new session |
| `compaction` | `experimental.session.compacting` | Preserves planning context before context window compaction |
| `shell-env` | Every `bash` tool execution | Injects FlowDeck environment variables |
| `context-window-monitor` | `message.updated`, `tool.execute.after` | Warns when context usage exceeds 70% of the token limit |
| `session-idle` | `session.idle` (when files edited) | Desktop notification and edits summary logging |
| `notifications` | Various | Desktop notification dispatch |
| `file-tracker` | During session | Tracks edited file paths across agent turns |

---

## `session-start` Hook

**File:** `src/hooks/session-start.ts`

**Fires:** `session.created` — when a new OpenCode session starts.

**What it does:**

Reads `.planning/STATE.md` from the workspace and injects the following context keys:

| Context Key | Source | Description |
|------------|--------|-------------|
| `flowdeck_phase` | `current_phase.phase` in STATE.md | Current planning phase or `null` if fresh |
| `flowdeck_status` | `current_phase.status` in STATE.md | Phase status or `null` |
| `flowdeck_steps_pending` | `current_phase.steps_pending` in STATE.md | Pending steps or `null` |
| `flowdeck_last_action` | `current_phase.last_action` in STATE.md | Last executed action or `null` |
| `flowdeck_has_codebase` | — | Whether `.codebase/` directory exists |
| `flowdeck_workspace_root` | `opencode.json` workspace config | Workspace root if multi-repo detected |
| `flowdeck_sub_repos` | `opencode.json` workspace config | List of sub-repositories |
| `flowdeck_workspace_mode` | `opencode.json` workspace config | Workspace mode |

**State read:**
- `.planning/STATE.md`
- `.codebase/` (existence check only)
- `opencode.json` (workspace config, if present)

**Errors:** If the state file is unreadable, the hook returns with `flowdeck_status: "error"` and a warning message — it does not block session startup.

---

## `compaction` Hook

**File:** `src/hooks/compaction-hook.ts`

**Fires:** `experimental.session.compacting` — when OpenCode triggers context window compaction.

**What it does:**

Injects a structured 8-section summary into the compaction context so the LLM summarization preserves FlowDeck-specific state:

1. **Planning State** — First 1500 characters of `.planning/STATE.md`
2. **Codebase Index** — First 800 characters of `.planning/CODEBASE_INDEX.md` (if present)
3. **Recently Edited Files** — Up to 20 files from `SessionFileTracker`

Then replaces the default summarization prompt with a structured template that requires the summary to include:
- User requests (verbatim)
- Final goal
- Work completed
- Remaining tasks
- Active working context
- Explicit constraints (verbatim)
- Verification state
- Delegated agent sessions (with `session_id` for resume)

**State read:**
- `.planning/STATE.md`
- `.planning/CODEBASE_INDEX.md`
- In-memory `SessionFileTracker` (edited paths ring buffer)

---

## `shell-env` Hook

**File:** `src/hooks/shell-env-hook.ts`

**Fires:** Every `bash` tool execution.

**What it does:**

Injects the following environment variables into every bash tool execution:

| Env Var | Source | Description |
|---------|--------|-------------|
| `FLOWDECK_VERSION` | `package.json` | Installed FlowDeck version |
| `FLOWDECK_PLUGIN` | `"true"` (constant) | Plugin activation flag |
| `PROJECT_ROOT` | `worktree` or `directory` | Resolved project root |
| `PACKAGE_MANAGER` | Detected lockfile | `npm`, `yarn`, `pnpm`, or `bun` |
| `DETECTED_LANGUAGES` | Marker files scan | Comma-separated list (e.g., `typescript,python`) |
| `PRIMARY_LANGUAGE` | Marker files scan | First detected language |
| `FLOWDECK_PHASE` | `STATE.md` phase field | Current FlowDeck planning phase |
| `RTK_INSTALLED` | Live `rtk --version` check | `"true"` if the rtk binary is found, `"false"` otherwise |
| `RTK_BIN` | rtk binary path | Full path to the rtk binary (only set when `RTK_INSTALLED=true`) |
| `RTK_TELEMETRY_DISABLED` | Set when rtk is installed | Always `"1"` when rtk is detected — blocks rtk telemetry regardless of consent state |

Language detection uses marker files: `tsconfig.json` (TypeScript), `go.mod` (Go), `pyproject.toml`/`requirements.txt` (Python), `Cargo.toml` (Rust), `build.gradle`/`pom.xml` (Java).

**rtk detection:** The binary is checked once at hook creation time (startup cost only) and cached for the session lifetime. Checks `PATH` first, then `~/.local/bin/rtk` and `/usr/local/bin/rtk`.

**Using rtk in bash commands:** When `RTK_INSTALLED=true`, agents can compress noisy CLI output by prefixing commands with `$RTK_BIN`:

```bash
$RTK_BIN git status      # compressed git status output
$RTK_BIN npm test        # compressed test runner output
$RTK_BIN tsc --noEmit    # compressed TypeScript compiler output
```

See [rtk Integration](rtk.md) for the full list of supported commands and setup instructions.

**State read:** `package.json`, lockfiles, marker files, `.planning/STATE.md`, `rtk` binary (PATH check)

---

## `context-window-monitor` Hook

**File:** `src/hooks/context-window-monitor.ts`

**Fires:** `message.updated` (assistant messages with token info), `tool.execute.after`.

**What it does:**

Tracks token usage per session. When input token usage exceeds 70% of `FLOWDECK_CONTEXT_LIMIT` (default: 200,000 tokens), appends a warning to the next tool output:

```
[FlowDeck Context Monitor]
Context: 71.4% used (142,800/200,000 tokens), 28.6% remaining.
You still have context remaining — do NOT rush or skip tasks. Work thoroughly.
```

The warning fires once per session (tracked by `sessionID`).

**Token limit override:** Set `FLOWDECK_CONTEXT_LIMIT` env var (e.g., `FLOWDECK_CONTEXT_LIMIT=150000`).

**State read:** Per-session token cache from `message.updated` events.

---

## `session-idle` Hook

**File:** `src/hooks/session-idle-hook.ts`

**Fires:** `session.idle` — when OpenCode's session becomes idle after a task is completed.

**Fires only when:** At least one file has been edited during the session (empty idle events are ignored).

**What it does:**

1. Sends a desktop notification via `notifySessionIdle()`
2. Logs a session summary via `client.app.log` (up to 10 edited files, then `… and N more`)

**State read:** In-memory `SessionFileTracker` (edited paths ring buffer).

---

## `file-tracker`

**File:** `src/hooks/file-tracker.ts`

**When it runs:** Continuously during session, tracking every file path edited by agents.

**What it does:**

Maintains a ring buffer of edited file paths. Consumed by the `compaction` hook (recently edited files) and `session-idle` hook (edited summary).

Implements a windowed snapshot of edited paths per session — consumed by compaction hook and idle hook.

---

## Other Hooks

| Hook | File | Purpose |
|------|------|---------|
| `approval-hook` | `approval-hook.ts` | Phase/project-level approval gates |
| `orchestrator-guard-hook` | `orchestrator-guard-hook.ts` | Guarding orchestrator delegation patterns |
| `decision-trace-hook` | `decision-trace-hook.ts` | Decision audit trail |
| `telemetry-hook` | `telemetry-hook.ts` | Workflow telemetry |
| `patch-trust` | `patch-trust.ts` | AI safety: patch trust scoring |
| `tool-guard` | `tool-guard.ts` | Tool usage guardrails |
| `auto-learn-hook` | `auto-learn-hook.ts` | Runtime policy learning |
| `todo-hook` | `todo-hook.ts` | Todo tracking integration |

These hooks are internal governance and safety mechanisms. The five hooks described above are the ones users interact with most directly.
