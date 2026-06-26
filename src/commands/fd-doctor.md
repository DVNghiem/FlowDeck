---
description: Check FlowDeck installation and environment health
---

# Doctor

Run environment health checks and report status.

## Checks

1. **OpenCode CLI** — run `opencode --version`. Report version if found, warn if not found.

2. **FlowDeck plugin registration** — read `~/.config/opencode/opencode.json` (or `$OPENCODE_CONFIG_DIR/opencode.json`). Check that `@dv.nghiem/flowdeck` is in the `plugin` array.

3. **Workspace state** — check if `.planning/STATE.md` exists in the current directory. Warn (non-fatal) if missing.

4. **Codebase map** — check if `.codebase/ARCHITECTURE.md` exists. Note if missing (suggest `/fd-map-codebase`).

5. **Planning phases** — if STATE.md exists, parse the current phase and check that `.planning/phases/phase-N/` directory exists.

6. **fdx binary** — run `fdx --version`. If it responds: ✅ fdx <version> available. If not found: ❌ fdx not found. Run `cargo build --release --manifest-path crates/fdx/Cargo.toml` to build it, then re-run /fd-doctor.

## Output Format

```
# FlowDeck Doctor Report

- [x] OpenCode detected: <version>
- [x] FlowDeck registered in ~/.config/opencode/opencode.json
- [x] .planning/STATE.md exists in current workspace
- [!] No .codebase/ARCHITECTURE.md found (run /fd-map-codebase)
- [x] Phase directory .planning/phases/phase-1/ exists
- [x] fdx <version> available

✅ Environment looks healthy!
```

Use `[x]` for pass, `[ ]` for failure (blocks healthy), `[!]` for warning (non-blocking).

Report `✅ Environment looks healthy!` if no failures, otherwise `❌ Some issues found.`
