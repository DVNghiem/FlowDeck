# Technology Stack

**Analysis Date:** 2026-06-26

## Languages

**Primary:**
- TypeScript — Plugin runtime, agent orchestration, tool implementations (`src/`)
- Rust — CLI tool `fdx` for token-optimized file reading (`crates/fdx/`)

**Secondary:**
- Markdown — Command templates (`src/commands/*.md`), documentation (`docs/`)
- JSON/YAML — Configuration files

## Runtime

**Environment:**
- Node.js (ESM) — TypeScript plugin compiled to ESM for OpenCode
- Rust 2021 edition — `fdx` CLI binary

**Package Manager:**
- Bun — Primary build tool and test runner for TypeScript (`bun.lock`)
- npm — Fallback (`package-lock.json` present)
- Cargo — Rust workspace manager (`Cargo.lock`)

## Frameworks

**Core:**
- OpenCode Plugin SDK (`@opencode-ai/plugin` ^1.17.3) — Plugin framework for OpenCode
- OpenCode SDK (`@opencode-ai/sdk` ^1.17.3, peer dependency) — Core SDK

**CLI:**
- clap 4 (derive feature) — Rust CLI argument parsing

**AST Parsing:**
- tree-sitter 0.26.9 — Multi-language AST parsing
- tree-sitter-python, tree-sitter-rust, tree-sitter-typescript, tree-sitter-javascript, tree-sitter-java — Language grammars

**Testing:**
- Vitest 4.1.8 — TypeScript test runner
- Cargo test — Rust unit and integration tests

**Build/Dev:**
- TypeScript 6.0.3 — Type checking and declaration emit
- Bun bundler — ESM build (`bun build`)
- rustfmt / clippy — Rust formatting and linting

## Key Dependencies

**Critical:**
- `@opencode-ai/plugin` ^1.17.3 — Plugin lifecycle, hooks, tool registration
- `clap` 4 — CLI structure for `fdx`
- `tree-sitter` 0.26.9 — Core AST engine for code analysis
- `serde` + `serde_json` — Rust serialization

**Infrastructure:**
- `anyhow` / `thiserror` — Rust error handling
- `dashmap` 6.2.1 — Concurrent hash map for AST cache
- `once_cell` 1 — Lazy static initialization
- `regex` 1 — Pattern matching in grep/search
- `ignore` 0.4 — Gitignore-aware file walking
- `glob` 0.3 — Glob pattern matching
- `unidiff` 0.4 — Unified diff parsing
- `tempfile` 3 — Temporary file handling
- `ejs` 6.0.1 — Template engine (dev dependency)

## Configuration

**Environment:**
- `flowdeck.json` — Per-project FlowDeck configuration (agent models, governance, rules)
- `.env` files — Runtime secrets (not committed)
- Environment variables: `FLOWDECK_GUARD_RAILS_ENABLED`, `FLOWDECK_TOOL_GUARD_ENABLED`

**Build:**
- `tsconfig.json` / `tsconfig.build.json` — TypeScript compiler config
- `Cargo.toml` (workspace root) — Rust workspace with `crates/fdx` member
- `package.json` — Node scripts, dependencies, exports

**Plugin Config:**
- `src/config/schema.ts` — Configuration schema validation
- `src/config/loader.ts` — Config file loading
- `src/config/agent-models.ts` — Agent model resolution

## Platform Requirements

**Development:**
- Node.js 20+ with ESM support
- Bun 1.3+ for builds and tests
- Rust toolchain (cargo, rustfmt, clippy)
- OpenCode CLI with plugin support

**Production:**
- Distributed as npm package `@dv.nghiem/flowdeck`
- `fdx` binary distributed via `bin/fdx` (compiled Rust)
- Target: OpenCode plugin runtime

---

*Stack analysis: 2026-06-26*
