# Codebase Concerns

**Analysis Date:** 2026-06-26

## Tech Debt

**Large TypeScript Files:**
- Issue: Several files exceed 500 lines, making them hard to maintain
- Files: `src/services/preflight-explorer.ts` (766), `src/hooks/orchestrator-guard-hook.ts` (763), `src/services/quick-router.ts` (663)
- Impact: Reduced readability, harder testing, increased cognitive load
- Fix approach: Extract focused sub-modules; keep files under 400 lines

**Plugin Entry Monolith:**
- Issue: `src/index.ts` handles config, rules, commands, tools, and hooks
- Files: `src/index.ts` (224 lines)
- Impact: Violates single responsibility; any change risks affecting the whole plugin
- Fix approach: Extract loaders into `src/loaders/` directory

**TODO Comments:**
- Issue: Minimal but present TODOs in source
- Files: `src/services/model-router.ts:10`, `src/agents/mapper.ts:76`
- Impact: Known unfinished work
- Fix approach: Address or ticket the TODOs

## Known Bugs

**None documented** — No open issues or bug tracking examined.

## Security Considerations

**Tool Guard:**
- Risk: Tool execution could perform dangerous operations
- Files: `src/hooks/tool-guard.ts`
- Current mitigation: Guard rails block dangerous ops, enforce architectural constraints
- Recommendations: Regular audit of guard rail rules

**Orchestrator Guard:**
- Risk: Orchestrator agent could write or execute shell commands
- Files: `src/hooks/orchestrator-guard-hook.ts`
- Current mitigation: Deny-by-default for orchestrator write/exec
- Recommendations: Ensure guard is always active

**Secret Handling:**
- Risk: Secrets in `.env` files
- Current mitigation: `.env` files are gitignored
- Recommendations: Verify no secrets in committed files

## Performance Bottlenecks

**AST Cache:**
- Problem: In-memory only; no persistence across sessions
- Files: `crates/fdx/src/reader/code/cache.rs`
- Cause: Each new session re-parses files
- Improvement path: Add optional disk cache

**Large File Processing:**
- Problem: No file size limits observed in readers
- Files: `crates/fdx/src/reader/mod.rs`
- Cause: Could read very large files into memory
- Improvement path: Add size checks and streaming for large files

## Fragile Areas

**Loop Detector:**
- Files: `src/services/loop-detector.ts`
- Why fragile: Hash-based detection can have collisions; threshold tuning is critical
- Safe modification: Add tests for edge cases before changing logic
- Test coverage: Partial — tests exist but may not cover all loop patterns

**Agent Contract Registry:**
- Files: `src/services/agent-contract-registry.ts`
- Why fragile: Contracts must stay in sync with actual agent capabilities
- Safe modification: Update contracts whenever agent tools change
- Test coverage: Unknown

**Model Router:**
- Files: `src/services/model-router.ts`
- Why fragile: TODO comment indicates incomplete implementation
- Safe modification: Complete the model switching integration
- Test coverage: Likely incomplete

## Scaling Limits

**In-Memory State:**
- Current capacity: All state in memory + file system
- Limit: No horizontal scaling; single-node only
- Scaling path: Not applicable for local plugin

**AST Cache:**
- Current capacity: Session-scoped DashMap
- Limit: Memory bound
- Scaling path: Add LRU eviction or disk backing

## Dependencies at Risk

**OpenCode SDK:**
- Risk: Tight coupling to `@opencode-ai/plugin` and `@opencode-ai/sdk`
- Impact: Breaking changes in SDK would require plugin updates
- Migration plan: Monitor SDK changelogs; maintain compatibility layer

**tree-sitter:**
- Risk: Native dependencies (C libraries) can cause build issues
- Impact: Cross-platform compilation challenges
- Migration plan: Pre-built binaries; CI matrix testing

## Missing Critical Features

**Persistent AST Cache:**
- Problem: No disk cache for parsed ASTs
- Blocks: Faster repeated analysis across sessions

**TypeScript Test Coverage:**
- Problem: No visible TypeScript test files (only Rust tests observed)
- Blocks: Confidence in plugin logic changes

## Test Coverage Gaps

**TypeScript Plugin Logic:**
- What's not tested: Most of `src/` has no visible tests
- Files: `src/services/`, `src/hooks/`, `src/tools/`
- Risk: Plugin regressions go undetected
- Priority: High

**Error Paths:**
- What's not tested: Error handling in fdx CLI
- Files: `crates/fdx/src/main.rs`
- Risk: CLI crashes on edge cases
- Priority: Medium

**Guard Rails:**
- What's not tested: Tool guard and orchestrator guard behavior
- Files: `src/hooks/tool-guard.ts`, `src/hooks/orchestrator-guard-hook.ts`
- Risk: Safety mechanisms may fail silently
- Priority: High

---

*Concerns audit: 2026-06-26*
