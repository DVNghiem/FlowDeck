# FlowDeck — Unified Repository, Two Native Plugins

**Status:** Implementation proposal for Codex; not a claim that features have been implemented.  
**Baseline declared by owner:** OpenCode `main` at **v0.8.0**, with **PR #15 merged** (OpenCode v1/v2 hosting; issue #13). Codex must verify the actual checkout and tests before making changes.  
**Primary outcome:** **One FlowDeck repository builds and distributes two independently installable native plugins: OpenCode and Claude Code.** Share one core and avoid a parallel harness, duplicate task state, or duplicate planning pipeline.

## 1. Decisions and scope

1. **Personal-first release.** Optimize installation and support for one primary developer initially. Keep release architecture compatible with future public distribution, but **do not require prebuilt FDX binaries or checksums in the initial release**. Revisit when third-party adoption is an explicit goal.
2. **OpenCode v2-first, v1 compatibility protected during extraction.** Treat v0.8.0's existing v1/v2 host boundary as the OpenCode adapter foundation. Run v1 and v2 regression tests during the refactor; do not expand v1 functionality. Dropping v1 requires a separate decision with usage evidence, migration notes and a release/deprecation plan. No PR #15 merge sequencing work remains.
3. **Claude Code plugin never edits user or project configuration.** Do not write or patch `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, project `.claude/settings*.json`, project `CLAUDE.md`, or provider credentials. Native plugin installation may create host-managed plugin registration/cache files; this is distinct from FlowDeck modifying settings. Document this distinction.
4. **Provider/environment configuration is user-owned.** BytePlus/model routing, API keys, environment variables, sandbox mode, permission mode and timeout defaults are not set by FlowDeck. The README may offer *optional* copy/paste settings examples, clearly marked user-controlled and version-checked.
5. **No separate `/fd-to-spec`, `/ai-build`, `/fd-task --from-conversation`, or `.ai/` planning tree.** `/fd-task` with no arguments derives the task from available conversation context; `/fd-task <description>` uses explicit input. The existing FlowDeck lifecycle remains canonical.
6. **Eight core commands only:** `/fd-task`, `/fd-review`, `/fd-execute`, `/fd-verify`, `/fd-done`, `/fd-checkpoint`, `/fd-resume`, `/fd-status`. `/fd-me` and `/fd-experience` are future ideas, outside implementation phases A–E.
7. **No automatic commit, push, deploy or destructive repository mutation.** Where existing FlowDeck behavior differs (for example per-step commits), identify and reconcile it in the migration plan before changing behavior.
8. **Context cost is measured, not a release gate.** Measure token, latency, tool-call failures and approval prompts without asserting reductions in advance.

## 2. Existing baseline and source-of-truth audit

FlowDeck currently has an OpenCode plugin, an established `/fd-task → /fd-review → /fd-execute → /fd-verify → /fd-done` lifecycle, supporting checkpoint/resume/status commands, twelve registered agents, FDX codebase/impact tools and planning state under `~/.fd-plan/<project-slug>/<topic>/`.

**Phase A must inspect actual source, git history and CI:**
- Verify `main` is v0.8.0 and PR #15's dual v1/v2 host implementation is merged, tested and usable as an OpenCode adapter seam. If not, report discrepancy; do not silently rewrite the baseline.
- Locate the current command registry, 12 agent definitions, runtime tools/hooks, FDX integration, state schema, validators, test runner and release pipeline.
- Identify historical inconsistencies: stale docs/agent counts, prompt-only versus enforced stage gates, trivial-task verification bypass, and `verified`/`not_verified` versus persisted status values.
- Record whether native dependencies or C/C++ toolchains are required by FDX and which supported macOS architectures can compile it.

**Architecture:**

```text
                       ONE FLOWDECK GIT REPOSITORY
                                  |
                    Shared Core / Workflow Contract
           routing, spec extraction, state, policy, tests
                      /                       \
           OpenCode Adapter              Claude Code Adapter
        (v0.8.0 v1/v2 seam)        (native plugin skills/agents/hooks)
                 |                             |
         OpenCode plugin                Claude Code plugin
                 \                             /
                    Optional FDX CLI integration
                                  |
                    Canonical ~/.fd-plan/ state
```

Core must not import either host SDK. Host adapters own conversation access, agent/tool dispatch, hook wiring, approvals and packaging. Keep extraction incremental; do not mandate a new monorepo layout unless the repo supports it. Two plugin artifacts must build from the same source commit/version and install independently.

**Cross-host compatibility:** shared task schema and artifact semantics are required. Simultaneous OpenCode↔Claude Code sessions, cross-host write locking and live resume handoff are **deferred**, not Phase C gates. Until implemented, detect incompatible concurrent state ownership where feasible and document single-writer guidance; do not imply safe concurrent writes.

## 3. Commands and conversation capture

| Command | Required behavior |
|---|---|
| `/fd-task` | Extract requirements and confirmed decisions from the accessible conversation; preview then plan |
| `/fd-task <description>` | Use explicit description; ask only material missing questions |
| `/fd-review` | Tier-appropriate review; independent review mandatory in FULL |
| `/fd-execute` | Implement approved steps with TDD where applicable; no automatic commits |
| `/fd-verify` | Targeted/full verification per tier; report failures honestly |
| `/fd-done` | Compare acceptance criteria against evidence; propose, never perform, commit/push without explicit authorization |
| `/fd-checkpoint` | Persist resumable task progress |
| `/fd-resume` | Restore task progress on the same supported host; do not promise cross-host execution handoff |
| `/fd-status` | Show state, verification gaps, and FDX availability/degraded mode |

**No-argument `/fd-task` contract:**
1. Extract only from the conversation history actually available to the host. Capture requirements, decisions, non-goals, acceptance criteria and unresolved questions. Tag each as **confirmed**, **proposed**, or **unknown**; record short provenance when available.
2. For **STANDARD/FULL**, display a concise requirements preview and request **one explicit one-line confirmation before codebase discovery or planning**. A rejection leads to correction of that preview, not a second planning pipeline. FAST may skip preview when the request is unambiguous and reversible.
3. If multiple unrelated tasks are present, ask which task to use. If history is truncated or unavailable, say so and ask for only the missing context. Never present inference as confirmed.
4. After confirmation, dispatch into the existing `/fd-task` planning engine and canonical state; no independent extractor artifacts or state tree.

**Risk routing:** hard FULL triggers include authentication/authorization, security-sensitive code, DB migration, public API/schema compatibility, concurrency-critical code, infrastructure/production changes and genuinely cross-module high-impact work. Otherwise choose FAST for low-risk local tasks and STANDARD for typical changes. Uncertainty alone does not force FULL; ask a focused question or choose STANDARD.

## 4. Tier artifacts, agents and approvals

| Tier | Artifacts | Agent routing | Approval/verification |
|---|---|---|---|
| **FAST** | `task.md` with inline mini-plan; no mandatory `architecture.md`, `affect.md`, `plan.md` | Main/orchestrator executes minimal path; specialist agents only on demonstrable need; no mandatory planner/mapper/reviewer | No extra preview if clear; targeted tests and mandatory final verification |
| **STANDARD** | `task.md`; `affect.md` only when multi-file impact/risk justifies it; inline steps by default | Orchestrator + mapper when discovery is needed; planner only on material ambiguity or multi-module change; coder/tester as needed; reviewer conditional | One conversation preview for no-arg task; approval only for meaningful risk or user decision; relevant tests |
| **FULL** | All four: `task.md`, `architecture.md`, `affect.md`, `plan.md` | Orchestrator coordinates; planner drafts; mapper/architect/researcher when relevant; specialist coder(s), tester, independent reviewer; security-auditor for security-sensitive work; debug-specialist on failures | Conversation preview, explicit execution approval, independent spec/code review, comprehensive verification |

The twelve existing agents are **available capabilities, not a fixed fan-out**: orchestrator, planner, architect, researcher, mapper, backend-coder, frontend-coder, devops, tester, reviewer, security-auditor, debug-specialist. Devops only for infra work; security-auditor only for security-sensitive work or risk-triggered review; debug-specialist only on diagnosis. Main/orchestrator may coordinate FAST without unnecessary delegation, subject to existing runtime restrictions—Codex must reconcile any orchestrator no-edit contract explicitly rather than quietly bypass it.

**Backward compatibility:** existing tasks with all four files remain readable. Validators, checkpoint, resume, execute, review and done must support sparse tier-specific artifacts; missing optional artifacts are not errors. FULL artifacts remain mandatory in FULL. Use a schema version and migration/compatibility tests rather than guessing file presence.

**TDD:** RED→GREEN→REFACTOR for business logic and bug fixes. Docs, formatting, mechanical config and pure styling may use appropriate alternate verification. If no test runner exists, propose a minimal setup and obtain approval before installing dependencies; record any accepted TDD exception.

## 5. Claude Code distribution and configuration boundary

- Package a **native Claude Code plugin** with supported manifest, commands/skills, agents and hooks. Phase A must validate actual layout and whether commands appear as `/fd-task` or namespaced `/flowdeck:fd-task`; document the real UX and choose the smallest supported way to preserve discoverability. Never promise an unverified unnamespaced alias.
- Plugin runtime **must not modify** user/project settings or install credentials. Plugin files inside its own distribution and host-managed installation metadata are permitted.
- No global/project `CLAUDE.md` injection by writing files. Prefer a short **SessionStart context message** (~20–30 lines maximum) covering respond in the language used by the user in the current conversation, TDD, no autonomous commit, command lifecycle and safe fallback. Benchmark context cost. SessionStart is guidance, **not a security boundary**; it may not run if hooks are disabled.
- README includes optional, explicitly user-applied permissions/sandbox deny examples, with syntax verified on the installed CLI. Avoid `acceptEdits` promises; **measure** approval frequency.
- Provider/model names, BytePlus endpoints and timeout environment variables are not setup deliverables. They may be recorded as external benchmark conditions, without storing secrets.

## 6. Security: explicit limitation and enforceable scope

**Threat model:** Because the plugin does not manage host permissions/sandbox, FlowDeck's installed `PreToolUse` policy hook is its **primary plugin-owned runtime enforcement layer**, not merely defense-in-depth. **It is not a universal security boundary**: host settings, disabled/untrusted hooks, unsupported tools, tool aliases, runtime failure, subprocess behavior and host permission semantics can bypass or limit coverage. User-managed permissions/sandbox and OS isolation remain stronger independent controls.

**Policy behavior:**
- Inspect Bash and supported file-mutating tools before execution; apply explicit `allow`, `ask` or `deny` decisions. Cover obvious dangerous operations (`git push`, unapproved commit/deploy, `gh` mutations, credential reads, destructive writes, shell indirection), with limitations and tests documented. Never claim to inspect commands run outside observable host tools.
- `rm -r src/old` → **ASK**; `rm -rf /`, `rm -rf ~`, `rm -rf ..`, repo root/ancestor or paths outside allowed worktree → **DENY**. Symlink escape → **DENY**. Unresolved shell variables, command substitutions, complex quoting, aliases and uncertain paths → **ASK or DENY**, never automatically allow. Build outputs such as `dist` and `.next` remain ASK by default.
- Resolve paths using realpath/canonical parent and lstat where relevant; account for macOS `/tmp` and `/var` resolving to `/private`, case-insensitive filesystems, symlink loops, worktrees, `..`, and TOCTOU limits. Never rely on raw string prefix checks alone. If safe resolution is impossible, fail closed for high-risk operations.
- Detect likely blocking/long-running foreground commands (`npm run dev`, `vite`, `next dev`, `tail -f`, `watch`, `sleep` of excessive duration, etc.). **ASK/DENY with a recommended bounded/background alternative**; do not claim to enforce a runtime timeout after an allowed command starts. A pre-execution hook cannot guarantee a command won't hang.
- No automatic formatting on Edit/Write; no Stop hook that blocks completion. Loop detection uses persisted per-session atomic state (not in-memory counters) and counts successful source edits only; writes to `~/.fd-plan/**`, `STATE.md`, `checkpoint.json` or logs do **not** reset repeated identical test-failure detection.

**Hook failure strategy:**
1. **Proposed minimum Claude Code version: `>= 2.1.295`**, subject to Phase A verification against official docs and real CLI tests (including whether this release actually supports `onFailure: "block"` for `PreToolUse`). Check `claude --version` before enabling the safety claim. On older/unsupported versions, enter **safety unsupported** mode: clearly warn, do not claim dangerous commands are blocked, and require user-controlled permissions/sandbox for high-risk work. Even on supported versions, smoke-test blocking hook errors and hook-not-loaded behavior.
2. In the policy dispatcher, catch unexpected exceptions and emit a **documented blocking decision/exit code 2** for dangerous or unclassifiable operations; do not accidentally exit 1. Validate JSON schema and exact hook semantics with CLI fixtures.
3. A missing Node executable **cannot be solved by a Node-based SessionStart hook**. Use a POSIX-shell bootstrap (no Node dependency) for both `SessionStart` and `PreToolUse`; account for GUI-launched macOS PATH. **For `PreToolUse`, if Node is missing, print `FlowDeck guard cần Node; sửa PATH hoặc tắt plugin` to stderr and exit `2`**, requesting a block. With verified `onFailure: "block"` this may prevent all guarded Bash calls until the environment is fixed; document this deliberate fail-closed tradeoff. **For `SessionStart`, warn visibly but do not block session startup.** When Node is available, `exec` the dispatcher; test the exact host treatment of stderr, exit 2, and launch failure. Quote every expanded plugin-root/path variable in shell commands, including `"${CLAUDE_PLUGIN_ROOT}"` where supported; avoid unsafe unquoted shell interpolation and test plugin paths containing spaces. Note that a missing shell, disabled hook or hook not loaded cannot be repaired by the bootstrap itself.
4. Include a health diagnostic in `/fd-status`: hook loaded/executable, Node path, runtime version, FDX status and degraded protection. **Never report safety as guaranteed solely because SessionStart succeeded.**
5. If fail-closed behavior cannot be demonstrated on the minimum supported host/version, explicitly mark the safety guarantee unsupported and require user-managed host permissions/sandbox for higher-risk operations; do not release with an unqualified "dangerous commands are blocked" claim.

## 7. FDX on macOS and graceful degradation

- Prefer `fdx` as a CLI invoked through an approved/observable Bash path. **Do not create an MCP server by default**; only reconsider if CLI integration proves insufficient. An optional user-managed Bash allowlist may reduce prompts but the plugin must not install one.
- Detect binary via documented `FLOWDECK_FDX_PATH` (if implemented) or PATH, validate executability and `fdx --version`, and expose capability detection in `/fd-status`. Use actual binary flags verified from source; do not invent a command interface.
- If FDX is missing/broken, warn once per relevant session/status and **degrade gracefully**: no graph/impact claims, no invented results, use ordinary repository inspection where feasible and mark uncertainty. Tasks requiring FDX-specific correctness must fail clearly rather than pretend to pass.
- Audit Rust/rustup, Xcode Command Line Tools, C/native dependencies, Apple Silicon arm64 and Intel x86_64. Use Node APIs or portable shell instead of assuming GNU `sed`, `realpath`, `timeout`. Test canonical path behavior on macOS, including `/private` aliases and case-folding; normalize project identifiers to avoid `Foo`/`foo` state collisions (prefer canonical root identity plus stable hash, with migration compatibility).
- Initial macOS CI: build FDX from source (`cargo build`) and smoke-test supported commands on arm64 and x86_64 runners **where runner availability permits**. If an Intel runner is unavailable, cross-compile/build the `x86_64-apple-darwin` target on an arm64 macOS runner and attempt x86_64 smoke tests through Rosetta 2 where available and permitted; record build target, actual execution architecture and Rosetta availability. If Rosetta cannot execute the tests, report x86_64 as **build-only, not smoke-tested**. Do not falsely claim both architectures tested. Prebuilt signed/checksummed binaries are a future distribution phase, not a Phase A–E gate.

## 8. State and reliability

- Canonical planning location remains `~/.fd-plan/<project-slug>/<topic>/` with `STATE.md`, checkpoint and existing logs. **No authoritative `.ai/` tree.** No duplicate host-local state stores.
- Distinguish task lifecycle (`planned`, `in_progress`, `complete`, `blocked`) from verification outcomes (`verified`, `not_verified`) with explicit typed fields; migrate old state safely.
- State writes are atomic, schema-validated and recoverable. Do not invent cross-host locking: live cross-host resume/write support is deferred. Single-host checkpoint/resume is required.
- Loop guard persists counters across separate Node hook processes. Identical failing test command/output repeated without a successful **source** edit is a signal; state/checkpoint/log writes never count as source progress. A successful source edit resets the relevant repeat signal. Include false-positive escape/retry behavior.
- Never auto-run `git diff` or hash entire repository on every hook invocation. Record only minimal tool event data; avoid secrets in logs.

## 9. Phases and deliverables

### Phase A — Read-only audit and architecture decision (approval gate)
Verify v0.8.0/PR #15 merge and v1/v2 host seam; inspect current code and FDX native dependencies; test Claude Code `>= 2.1.295` minimum-version claim, actual installed `claude --version`, plugin packaging, command namespace, hook JSON/exit semantics, `onFailure` support, Node bootstrap and optional settings boundaries; baseline tool failures/latency/approvals on actual hosts/provider. **Do not change source, install dependencies or mutate settings.**

**Output cap:** one concise decision memo, **≤1,200 words**, with: (a) verified facts and evidence links/paths, (b) up to five highest-risk gaps, (c) selected plugin packaging and host/version matrix, (d) proposed minimal file-change sequence, (e) unresolved decisions and test commands. Supporting raw benchmark data may be separate; do not generate a stack of redundant ADRs/reports. **Stop and request approval.**

### Phase B — Shared core and OpenCode regression
Extract only necessary core interfaces from v0.8.0; preserve v1/v2 host boundary; add tier-specific sparse artifacts, conversation preview contract and schema compatibility. Run v1 and v2 regression tests. No PR #15 sequencing task.

### Phase C — Native Claude Code plugin vertical slice
Build/install Claude plugin independently; implement `/fd-task`, `/fd-status` and minimal state roundtrip, host-native agent/skill/hook integration, Node bootstrap and verified command naming. FDX may be absent. **Cross-host resume is not a gate.**

### Phase D — Complete workflow and safety
Implement review/execute/verify/done/checkpoint/resume, TDD/verification, policy hook and failure-mode tests, graceful FDX degradation. Reconcile commit policy. Demonstrate the documented safety boundary on supported CLI versions.

### Phase E — CI, macOS smoke tests, benchmark and release
Build both plugin artifacts from one commit; test OpenCode v1/v2 and Claude Code; macOS FDX build/smoke; install/uninstall/update docs; performance/approval measurements; rollback instructions. Do not require a token or approval improvement to ship; require no critical correctness/security regressions.

**Deferred:** cross-host live resume and locking; public binary FDX distribution; `/fd-me`, `/fd-experience`; optional MCP; dropping OpenCode v1.

## 10. Acceptance fixtures (minimum)

| Area | Required fixture |
|---|---|
| Baseline | v0.8.0 source and PR #15 merge verified; OpenCode v1/v2 regression |
| Packaging | One repo builds two independently installable native plugins; Claude Code namespace verified |
| `/fd-task` | No-arg confirmed/proposed/unknown preview; STANDARD/FULL one confirmation; FAST shortcut; truncated history; multiple task ambiguity |
| Artifacts | FAST task-only; STANDARD optional affect; FULL all four; old four-file task loads |
| Agents | No mandatory planner/reviewer in FAST; planner conditional in STANDARD; independent reviewer in FULL |
| Safety | `rm -r src/old` ASK; `rm -rf /`, `~`, `..`, outside repo and symlink escape DENY; unknown shell expansion ASK/DENY |
| macOS paths | `/tmp` vs `/private/tmp`, case-folding, worktree roots, slug collision |
| Hook failure | `claude --version` below/at proposed minimum; Node missing: PreToolUse stderr + exit 2, SessionStart warning only; hook exception; exit 1; exit 2; invalid JSON; timeout; disabled hook; verified fail-closed capability where available |
| Shell bootstrap | Plugin root containing spaces (e.g. `Application Support`); quoted `${CLAUDE_PLUGIN_ROOT}` expansion; GUI-launched macOS PATH without Node |
| Long-running | dev server, `tail -f`, `watch` pre-execution ASK/DENY; no false promise of runtime termination |
| Loop | Identical pytest failure + state/checkpoint/log edit does not reset; successful source edit resets; counters persist across processes |
| FDX | Available/versioned; absent/degraded; invalid binary; macOS arm64/x86_64 native or cross-build coverage; Rosetta execution tested where feasible, otherwise build-only disclosed |
| State | Atomic write/recovery, schema migration, single-host resume, cross-host handoff explicitly unsupported |
| Policy | No user/project settings mutation; no credentials; no unapproved commit/push/deploy |
| Verification | FAST still verifies; FULL reviewer/security checks; no false green status |

## 11. Codex execution instruction

> Treat this as a target design, not as proof of existing implementation. Start with **Phase A only** and verify all host-specific behavior against the actual installed versions, official documentation and repository source. Respect the **≤1,200-word memo limit**. Do not edit code, user/project settings, install dependencies, commit, push or deploy during Phase A. Present the smallest safe implementation sequence and wait for explicit approval before Phase B.

## 12. Documentation references to verify in Phase A

- Claude Code official hooks reference: https://code.claude.com/docs/en/hooks
- Claude Code official plugins reference: https://code.claude.com/docs/en/plugins
- Claude Code official settings reference: https://code.claude.com/docs/en/settings
- OpenCode plugin documentation and actual installed OpenCode v1/v2 APIs
- FlowDeck repository `main` at v0.8.0, merged PR #15 and issue #13 (owner-supplied baseline; verify in git)

**Caution:** The proposed `2.1.295` minimum is an owner-supplied target, **not independently verified in this document**. Phase A must verify the version and hook semantics before treating them as supported. Hook failure behavior and supported keys vary by CLI version. The current Claude Code hook documentation describes blocking exit code 2 and, in newer versions, `onFailure: "block"` for applicable hook types; this is **not** a substitute for running the real CLI smoke tests. A plugin cannot guarantee protection if its hooks are not loaded or the host permits bypass.
