# Codebase Structure

**Analysis Date:** 2026-06-26

## Directory Layout

```
[project-root]/
├── src/                    # TypeScript plugin source
│   ├── agents/             # Agent definitions (25 agents)
│   ├── commands/           # Slash command templates (*.md)
│   ├── config/             # Configuration loading and schema
│   ├── hooks/              # Tool execution hooks and guards
│   ├── lib/                # Shared utilities
│   ├── mcp/                # MCP server integrations
│   ├── rules/              # Language-specific coding rules
│   ├── services/           # Core business logic
│   ├── skills/             # Reusable workflow skills
│   ├── tools/              # Tool implementations
│   └── types/              # Type definitions
├── crates/                 # Rust workspace
│   └── fdx/                # fdx CLI crate
│       ├── src/            # Rust source
│       │   ├── output/     # Output formatters (text, json)
│       │   ├── reader/     # File readers and analyzers
│       │   └── reader/code/# AST parsing and caching
│       └── tests/          # Integration tests
├── bin/                    # Binary wrappers
├── dist/                   # Compiled TypeScript output
├── docs/                   # Documentation
├── scripts/                # Build/validation scripts
└── tests/                  # Test utilities (if any)
```

## Directory Purposes

**`src/agents/`:**
- Purpose: Agent capability definitions and routing
- Contains: 24 TypeScript files defining agent configs
- Key files: `src/agents/index.ts` (registry), `src/agents/orchestrator.ts`, `src/agents/planner.ts`

**`src/tools/`:**
- Purpose: Tool implementations exposed to OpenCode
- Contains: 13+ tool files (fdx, planning, codebase, merge assist, etc.)
- Key files: `src/tools/fdx.ts`, `src/tools/planning-state.ts`, `src/tools/codegraph-tool.ts`

**`src/services/`:**
- Purpose: Core business logic and runtime services
- Contains: 25 service files
- Key files: `src/services/loop-detector.ts`, `src/services/agent-contract-registry.ts`, `src/services/quick-router.ts`

**`src/hooks/`:**
- Purpose: Tool execution interception and safety enforcement
- Contains: 14 hook files
- Key files: `src/hooks/tool-guard.ts`, `src/hooks/guard-rails.ts`, `src/hooks/orchestrator-guard-hook.ts`

**`src/config/`:**
- Purpose: Configuration schema, loading, and agent model resolution
- Contains: 4 files
- Key files: `src/config/loader.ts`, `src/config/schema.ts`

**`crates/fdx/src/`:**
- Purpose: Rust CLI for token-optimized file operations
- Contains: 30 Rust source files
- Key files: `crates/fdx/src/main.rs`, `crates/fdx/src/lib.rs`, `crates/fdx/src/runner.rs`

**`crates/fdx/src/reader/`:**
- Purpose: File reading, searching, and analysis
- Contains: 13 files (batch, diff, grep, impact, lint, ls, outline, search, tree, git, test_runner, mod)
- Key files: `crates/fdx/src/reader/mod.rs`, `crates/fdx/src/reader/batch.rs`

**`crates/fdx/src/output/`:**
- Purpose: Output formatting (text and JSON)
- Contains: 7 files
- Key files: `crates/fdx/src/output/text.rs`, `crates/fdx/src/output/json.rs`

**`crates/fdx/src/reader/code/`:**
- Purpose: AST parsing, caching, and deep mode
- Contains: 5 files + languages subdirectory
- Key files: `crates/fdx/src/reader/code/parser.rs`, `crates/fdx/src/reader/code/cache.rs`, `crates/fdx/src/reader/code/deep.rs`

**`crates/fdx/tests/`:**
- Purpose: Rust integration tests
- Contains: 16 test files
- Key files: `crates/fdx/tests/test_core.rs`, `crates/fdx/tests/test_batch.rs`

## Key File Locations

**Entry Points:**
- `src/index.ts` — Plugin entry point
- `crates/fdx/src/main.rs` — fdx CLI entry point
- `crates/fdx/src/lib.rs` — fdx library entry point

**Configuration:**
- `package.json` — Node package config
- `Cargo.toml` — Rust workspace config
- `tsconfig.json` / `tsconfig.build.json` — TypeScript config
- `src/config/schema.ts` — FlowDeck config schema

**Core Logic:**
- `src/services/quick-router.ts` — Workflow routing
- `src/services/loop-detector.ts` — Loop detection
- `src/services/agent-contract-registry.ts` — Agent contracts
- `crates/fdx/src/reader/mod.rs` — File reading core
- `crates/fdx/src/reader/code/parser.rs` — AST parsing

**Testing:**
- `crates/fdx/tests/` — Rust integration tests (16 files)
- Vitest tests co-located or in `tests/` (TypeScript)

## Naming Conventions

**Files:**
- TypeScript: `kebab-case.ts` (e.g., `loop-detector.ts`, `planning-state.ts`)
- Rust: `snake_case.rs` (e.g., `test_runner.rs`, `ls_tree_json.rs`)

**Directories:**
- TypeScript: `kebab-case/` (e.g., `src/agents/`, `src/hooks/`)
- Rust: `snake_case/` (e.g., `reader/code/`)

## Where to Add New Code

**New Tool:**
- Primary code: `src/tools/{tool-name}.ts`
- Registration: `src/index.ts` (add to tool object)
- Tests: Co-located or in `tests/`

**New Agent:**
- Implementation: `src/agents/{agent-name}.ts`
- Registration: `src/agents/index.ts`

**New fdx Command:**
- CLI arg: `crates/fdx/src/main.rs` (add to `Commands` enum)
- Logic: `crates/fdx/src/reader/{command}.rs`
- Output: `crates/fdx/src/output/` (if new format needed)
- Tests: `crates/fdx/tests/test_{command}.rs`

**New Service:**
- Implementation: `src/services/{service-name}.ts`

**Shared Utilities:**
- `src/lib/{utility-name}.ts`

## Special Directories

**`dist/`:**
- Purpose: Compiled TypeScript output
- Generated: Yes (via `bun build`)
- Committed: Yes (published to npm)

**`node_modules/`:**
- Purpose: Node dependencies
- Generated: Yes
- Committed: No

**`target/`:**
- Purpose: Rust build artifacts
- Generated: Yes (via `cargo build`)
- Committed: No

---

*Structure analysis: 2026-06-26*
