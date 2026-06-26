<!-- refreshed: 2026-06-26 -->
# Architecture

**Analysis Date:** 2026-06-26

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Plugin Host                      │
├──────────────────┬──────────────────┬───────────────────────┤
│   Plugin Entry   │   Agent System   │    Tool Registry      │
│  `src/index.ts`  │ `src/agents/`    │   `src/tools/`        │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│              FlowDeck Core Services                          │
│  `src/services/` — Router, Validator, Loop Detector, etc.   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Hooks & Guard Rails        │   fdx CLI (Rust)              │
│  `src/hooks/`               │   `crates/fdx/`               │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Plugin Entry | Bootstrap, config loading, tool/hook registration | `src/index.ts` |
| Agent Registry | Agent definitions, routing, model resolution | `src/agents/index.ts` |
| Tool Registry | fdx tools, planning, codebase, merge assist | `src/tools/` |
| Config Loader | flowdeck.json parsing, schema validation | `src/config/loader.ts` |
| Loop Detector | Detect tool call loops, agent bounce loops | `src/services/loop-detector.ts` |
| Orchestrator Guard | Deny-by-default for orchestrator write/exec | `src/hooks/orchestrator-guard-hook.ts` |
| Tool Guard | Block dangerous ops, enforce constraints | `src/hooks/tool-guard.ts` |
| fdx CLI | Token-optimized file reader (Rust) | `crates/fdx/src/main.rs` |
| AST Parser | Multi-language AST parsing via tree-sitter | `crates/fdx/src/reader/code/` |

## Pattern Overview

**Overall:** Plugin-based multi-agent orchestration with safety layers

**Key Characteristics:**
- Event-driven plugin lifecycle (session created, idle, error)
- Tool interception pattern (before/after hooks)
- Agent delegation with contract validation
- File-based state persistence
- Dual runtime: TypeScript (plugin) + Rust (CLI)

## Layers

**Plugin Layer:**
- Purpose: OpenCode integration, lifecycle management
- Location: `src/index.ts`
- Contains: Plugin definition, config merge, tool registration
- Depends on: Config, Agents, Tools, Hooks, Services
- Used by: OpenCode runtime

**Agent Layer:**
- Purpose: Define 25 specialist agents with capabilities
- Location: `src/agents/`
- Contains: Agent configs, routing tables, model overrides
- Depends on: Config
- Used by: Plugin layer, Orchestrator

**Tool Layer:**
- Purpose: Expose 20+ tools to OpenCode
- Location: `src/tools/`
- Contains: fdx tools, planning, codebase, merge assist, etc.
- Depends on: Services, fdx CLI
- Used by: Plugin layer

**Service Layer:**
- Purpose: Core business logic, routing, validation
- Location: `src/services/`
- Contains: Router, validator, loop detector, codegraph, audit log
- Depends on: Types, Config
- Used by: Tools, Hooks

**Hook Layer:**
- Purpose: Intercept tool execution, enforce safety
- Location: `src/hooks/`
- Contains: Guard rails, tool guard, orchestrator guard, session hooks
- Depends on: Services
- Used by: Plugin layer (tool.before/after, event handlers)

**fdx CLI Layer:**
- Purpose: Token-optimized file operations
- Location: `crates/fdx/`
- Contains: Read, search, grep, batch, impact, outline, diff, ls, tree, git, test, lint
- Depends on: tree-sitter, serde, regex
- Used by: TypeScript tools via shell execution

## Data Flow

### Primary Tool Execution Path

1. OpenCode invokes tool → `tool.execute.before` hook (`src/index.ts:169`)
2. Orchestrator guard checks permissions (`src/hooks/orchestrator-guard-hook.ts`)
3. Guard rails validate planning phase (`src/hooks/guard-rails.ts`)
4. Tool guard blocks dangerous ops (`src/hooks/tool-guard.ts`)
5. Loop detector checks for repetition (`src/services/loop-detector.ts`)
6. Tool executes (e.g., `fdx-read` → spawns `fdx` CLI)
7. `tool.execute.after` hook records completion (`src/index.ts:192`)

### Session Lifecycle Flow

1. `session.created` event → `sessionStartHook` (`src/hooks/session-start.ts`)
2. Lazy rule loading based on detected project languages
3. Agent config resolution from `flowdeck.json`
4. Session idle/error events → `sessionEventsHook`

## Key Abstractions

**Plugin:**
- Purpose: OpenCode plugin contract implementation
- Examples: `src/index.ts`
- Pattern: Factory function returning plugin object with config/tool/event handlers

**Tool:**
- Purpose: Callable operation exposed to OpenCode
- Examples: `src/tools/fdx.ts`, `src/tools/planning-state.ts`
- Pattern: Async function receiving context, returning result

**Agent Config:**
- Purpose: Define agent capabilities and constraints
- Examples: `src/agents/index.ts`, `src/config/agent-models.ts`
- Pattern: Object with model, tools, instructions, guard rails

**Guard Hook:**
- Purpose: Intercept and validate tool execution
- Examples: `src/hooks/tool-guard.ts`, `src/hooks/guard-rails.ts`
- Pattern: Async function throwing on violation

## Entry Points

**Plugin Entry:**
- Location: `src/index.ts`
- Triggers: OpenCode plugin load
- Responsibilities: Register tools, hooks, agents, commands; merge config

**fdx CLI Entry:**
- Location: `crates/fdx/src/main.rs`
- Triggers: Shell command `fdx <subcommand>`
- Responsibilities: Parse args, dispatch to reader modules

**fdx Library Entry:**
- Location: `crates/fdx/src/lib.rs`
- Triggers: Rust crate import
- Responsibilities: Export reader, output, and code modules

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js). fdx CLI is synchronous Rust.
- **Global state:** Plugin config stored in closure; loop detector per-session
- **Circular imports:** None detected
- **Plugin isolation:** Must not mutate OpenCode internals; only via approved APIs

## Anti-Patterns

### Large Files

**What happens:** Several TypeScript files exceed 500 lines (e.g., `src/services/preflight-explorer.ts` 766 lines, `src/hooks/orchestrator-guard-hook.ts` 763 lines)
**Why it's wrong:** Hard to navigate, test, and reason about
**Do this instead:** Extract focused modules; keep files under 400 lines

### Mixed Concerns in Plugin Entry

**What happens:** `src/index.ts` handles config loading, rule loading, command loading, tool registration, and hook wiring
**Why it's wrong:** Violates single responsibility; changes to any area require editing the main file
**Do this instead:** Extract loaders into dedicated modules

## Error Handling

**Strategy:** Layered — Rust uses `anyhow`/`thiserror`; TypeScript uses try/catch with typed errors

**Patterns:**
- Rust: `Result<T, E>` with `?` propagation; `anyhow::Context` for context
- TypeScript: `try/catch` with `unknown` error narrowing; graceful degradation

## Cross-Cutting Concerns

**Logging:** OpenCode SDK app log integration; structured via `client.app.log`
**Validation:** JSON schema validation for config; agent contract validation pre-execution
**Authentication:** Delegated to OpenCode SDK

---

*Architecture analysis: 2026-06-26*
