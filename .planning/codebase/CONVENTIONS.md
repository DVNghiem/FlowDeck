# Coding Conventions

**Analysis Date:** 2026-06-26

## Naming Patterns

**Files:**
- TypeScript: `kebab-case.ts` (e.g., `loop-detector.ts`, `planning-state.ts`)
- Rust: `snake_case.rs` (e.g., `test_runner.rs`, `ls_tree_json.rs`)

**Functions:**
- TypeScript: `camelCase` (e.g., `loadConfig`, `detectLoops`)
- Rust: `snake_case` (e.g., `read_file`, `parse_mode`)

**Variables:**
- TypeScript: `camelCase` (e.g., `loopDetector`, `agentConfig`)
- Rust: `snake_case` (e.g., `cli`, `options`)

**Types/Interfaces:**
- TypeScript: `PascalCase` (e.g., `FlowDeckConfig`, `ReaderOptions`)
- Rust: `PascalCase` (e.g., `Cli`, `Commands`, `AstCache`)

**Constants:**
- TypeScript: `UPPER_SNAKE_CASE` for true constants
- Rust: `SCREAMING_SNAKE_CASE`

## Code Style

**Formatting:**
- TypeScript: Prettier (inferred from project structure)
- Rust: rustfmt (standard)

**Linting:**
- TypeScript: TypeScript compiler strict mode
- Rust: clippy with warnings-as-errors policy

**Line Length:**
- Rust: 100 characters (rustfmt default)
- TypeScript: ~100 characters (inferred)

## Import Organization

**Order:**
1. Built-in modules (`fs`, `path`)
2. External dependencies (`@opencode-ai/plugin`)
3. Internal modules (`./services/`, `./hooks/`)

**Path Aliases:**
- None observed — uses relative imports

## Error Handling

**TypeScript:**
- `try/catch` with `unknown` error type
- Graceful degradation (catch blocks often ignore errors with `/* ignore */`)
- Example: `src/index.ts:73` — `catch { /* ignore */ }`

**Rust:**
- `Result<T, E>` with `?` propagation
- `anyhow` for application errors
- `thiserror` for library errors
- Context added via `.with_context()`

## Logging

**Framework:** OpenCode SDK app log

**Patterns:**
- Structured logging via `client.app.log({ service: "flowdeck", level, message })`
- Session event logging
- Tool execution logging in `tool.execute.after`

## Comments

**When to Comment:**
- JSDoc for exported functions and types
- Inline comments for complex logic
- TODO/FIXME for known issues (minimal — only 2 found in src/)

**JSDoc/TSDoc:**
- Used for plugin entry and public APIs
- Example: `src/index.ts:49` — `/** Select FlowDeck rule paths... */`

## Function Design

**Size:**
- TypeScript: Variable — some large functions (plugin entry ~170 lines)
- Rust: Moderate — main match arms are long but focused

**Parameters:**
- TypeScript: Options objects for complex functions
- Rust: Struct-based options (e.g., `ReaderOptions`, `LsOptions`)

**Return Values:**
- TypeScript: Explicit return types on exports
- Rust: `Result<T, E>` for fallible operations

## Module Design

**Exports:**
- TypeScript: Named exports preferred
- Rust: `pub` visibility controlled; re-exports in `mod.rs`/`lib.rs`

**Barrel Files:**
- `src/agents/index.ts` — Re-exports all agent configs
- `src/config/index.ts` — Re-exports config types and loader
- `src/hooks/index.ts` — Re-exports hooks
- Rust: `mod.rs` files in each directory

## Language-Specific Conventions

**TypeScript:**
- ESM modules (`import`/`export`)
- `type` imports for type-only dependencies
- `Readonly<T>` for immutable parameters
- `unknown` over `any` for catch clauses

**Rust:**
- Immutable by default (`let` not `let mut`)
- Borrow (`&T`) over ownership where possible
- Builder pattern for complex structs
- Sealed traits for extensibility control

---

*Convention analysis: 2026-06-26*
