//! Cross-agent context command implementations.
//!
//! These were originally TypeScript tools (fdx-context.ts, fdx-decisions.ts) and
//! were ported to Rust so the logic lives alongside the other `fdx` subcommands
//! and uses native file-locking primitives.

pub mod context;
pub mod decisions;
