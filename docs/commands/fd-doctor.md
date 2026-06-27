# /fd-doctor

**Purpose:** Check FlowDeck installation and environment health across the system.

## Usage

/fd-doctor

## What Happens

The command runs a series of diagnostic checks and reports status for each:

1. **OpenCode CLI** — runs `opencode --version`. Reports the version if found, warns if not found.

2. **FlowDeck plugin registration** — reads `~/.config/opencode/opencode.json` (or `$OPENCODE_CONFIG_DIR/opencode.json`). Checks that `@dv.nghiem/flowdeck` is present in the `plugins` array.

3. **Workspace state** — checks whether `.planning/STATE.md` exists in the current directory. Warns (non-fatal) if missing.

4. **Codebase map** — checks whether `.codebase/ARCHITECTURE.md` exists. Notes if missing and suggests `/fd-map-codebase`.

5. **Planning phases** — if STATE.md exists, parses the current phase and verifies that `.planning/phases/phase-N/` directory exists.

## Notation Legend

The report uses check box notation:

| Notation | Meaning |
|----------|---------|
| `[x]` | Pass — check succeeded |
| `[ ]` | Failure — blocks healthy status |
| `[!]` | Warning — non-blocking issue |

The report closes with `✅ Environment looks healthy!` if no failures, otherwise `❌ Some issues found.`

## Output / State

The command produces a formatted report using check box notation:

```
# FlowDeck Doctor Report

- [x] OpenCode detected: <version>
- [x] FlowDeck registered in ~/.config/opencode/opencode.json
- [x] .planning/STATE.md exists in current workspace
- [!] No .codebase/ARCHITECTURE.md found (run /fd-map-codebase)
- [x] Phase directory .planning/phases/phase-1/ exists

✅ Environment looks healthy!
```

Notation:
- `[x]` — pass
- `[ ]` — failure (blocks healthy status)
- `[!]` — warning (non-blocking)

The report closes with `✅ Environment looks healthy!` if no failures, otherwise `❌ Some issues found.`

## Output Example

When running the orchestrator with "implement user login", the autonomous execution begins with this classification announcement:

```
Task classified as: feature
Stage sequence:     discuss → plan → execute → verify
Requires design:     no
Requires TDD:        yes
Evidence used:       12 items from preflight exploration

Running autonomously. I will proceed through each stage and pause only
if I need approval, encounter a blocker, or complete the full sequence.
```

## Examples

**Run diagnostics:**
```
/fd-doctor
```

**Sample healthy output:**
```
# FlowDeck Doctor Report

- [x] OpenCode detected: 1.2.3
- [x] FlowDeck registered in ~/.config/opencode/opencode.json
- [x] .planning/STATE.md exists in current workspace
- [x] .codebase/ARCHITECTURE.md found
- [x] Phase directory .planning/phases/phase-1/ exists

✅ Environment looks healthy!
```

**Sample output with issues:**
```
# FlowDeck Doctor Report

- [x] OpenCode detected: 1.2.3
- [ ] FlowDeck NOT registered in ~/.config/opencode/opencode.json
- [x] .planning/STATE.md exists in current workspace
- [!] No .codebase/ARCHITECTURE.md found (run /fd-map-codebase)

❌ Some issues found.
```

## Related Commands

- `/fd-map-codebase` — generate .codebase/ documentation if ARCHITECTURE.md is missing
- `/fd-status` — view current project state for more detail