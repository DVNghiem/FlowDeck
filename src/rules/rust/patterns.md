---
description: Rust conventions — ownership, error handling with Result/Option, unsafe boundaries, testing
always_on: false
stages: [execute, fix-bug, verify]
languages: [rust]
---

# Rust Patterns

Rust conventions for FlowDeck projects.

## Prefer Result<T, E> Over Panicking in Library Code

Library code must not panic on expected failure conditions. Return `Result` and let the caller decide how to handle the error.

```rust
// ❌ Panics on invalid input — caller has no recovery path
pub fn parse_port(s: &str) -> u16 {
    s.parse().unwrap()
}

// ✅ Return Result — caller decides what to do
pub fn parse_port(s: &str) -> Result<u16, std::num::ParseIntError> {
    s.parse()
}
```

Application code (binaries, CLI entrypoints) may use `?` propagation up to `main`, which prints the error and exits.

## Use thiserror for Library Errors, anyhow for Application Errors

```rust
// Library crate: thiserror — structured, matchable error variants
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CacheError {
    #[error("key {0:?} not found")]
    NotFound(String),
    #[error("serialization failed: {0}")]
    Serialize(#[from] serde_json::Error),
}

// Application binary: anyhow — ergonomic propagation with context
use anyhow::{Context, Result};

fn run() -> Result<()> {
    let config = load_config("app.toml")
        .context("loading application config")?;
    serve(config).await
}
```

## Never Use unwrap() in Production Code

`unwrap()` panics on `None` or `Err`. Use `expect()` with a message that explains the invariant being asserted, or propagate with `?`.

```rust
// ❌ Panics with an unhelpful message
let port: u16 = env::var("PORT").unwrap().parse().unwrap();

// ✅ expect() with a reason
let port_str = env::var("PORT")
    .expect("PORT environment variable must be set");
let port: u16 = port_str
    .parse()
    .expect("PORT must be a valid u16");

// ✅ Propagate with ? when inside a Result-returning function
let port: u16 = env::var("PORT")?.parse()?;
```

## All Public Items Must Have rustdoc Comments

Every public function, struct, enum, trait, and module requires a doc comment (`///`).

```rust
// ❌ No documentation
pub fn compress(data: &[u8]) -> Vec<u8> { ... }

// ✅ Describe what it does, mention important contracts
/// Compresses `data` using LZ4 and returns the compressed bytes.
///
/// Returns an empty `Vec` if `data` is empty.
/// Panics if the internal compressor is exhausted (should never happen in practice).
pub fn compress(data: &[u8]) -> Vec<u8> { ... }
```

## Use the Newtype Pattern for Semantically Distinct Primitives

Wrapping primitives prevents accidentally mixing values of different meaning.

```rust
// ❌ Easy to confuse which u64 is which
fn transfer(from: u64, to: u64, amount: u64) { ... }

// ✅ Distinct types — compiler catches transpositions
pub struct AccountId(u64);
pub struct CentAmount(u64);

fn transfer(from: AccountId, to: AccountId, amount: CentAmount) { ... }
```

Newtype wrappers have zero runtime overhead.

## Prefer iter() Chains Over Explicit Loops When Semantics Are Clear

```rust
// ❌ Explicit loop for a pure transformation
let mut result = Vec::new();
for item in &items {
    if item.is_active() {
        result.push(item.name.clone());
    }
}

// ✅ Iterator chain — intent is immediately clear
let result: Vec<String> = items.iter()
    .filter(|item| item.is_active())
    .map(|item| item.name.clone())
    .collect();

// Use explicit loops when there are side effects or early returns that
// would obscure the logic if written as a chain
```

## Derive Debug, Clone, PartialEq by Default on Data Structs

```rust
// ✅ Standard derives on data-holding structs
#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub max_connections: usize,
}

// Add Eq when PartialEq implies total equality (no floats)
// Add Hash when the type will be used as a map key
// Add Serialize/Deserialize when crossing I/O boundaries
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct UserId(u64);
```

## Test Organization

- **Unit tests**: inside the module in a `#[cfg(test)]` block, next to the code they test.
- **Integration tests**: in a top-level `tests/` directory. These test the public API of the crate.
- **Doctests**: write examples in doc comments — they are compiled and run by `cargo test`.

```rust
// src/parser.rs
pub fn parse(input: &str) -> Result<Ast, ParseError> { ... }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_error() {
        assert!(parse("").is_err());
    }

    #[test]
    fn valid_expression_parses_correctly() {
        let ast = parse("1 + 2").unwrap();
        assert_eq!(ast.eval(), 3);
    }
}
```

```rust
// tests/integration_test.rs  — tests/ is a separate crate
use mylib::parse;

#[test]
fn parses_complex_expression() {
    let result = parse("(a + b) * c");
    assert!(result.is_ok());
}
```

## clippy Must Pass with No Warnings

All code must pass `cargo clippy -- -D warnings` with no warnings. Enforce this in CI.

If a lint must be suppressed, add `#[allow(...)]` on the smallest scope possible with a comment explaining why.

```rust
// ❌ Global allow — hides all issues of that category
#![allow(clippy::unwrap_used)]

// ✅ Local suppression with explanation
#[allow(clippy::unwrap_used)]
// Safety: regex pattern is a compile-time constant and always valid
let re = Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap();
```

## Never Use unsafe Without a Safety Comment

Every `unsafe` block must have a comment that documents the invariants being upheld and why the operation is sound.

```rust
// ❌ unsafe with no explanation
unsafe {
    std::ptr::write(ptr, value);
}

// ✅ Safety comment explains the contract
// SAFETY: `ptr` is non-null, properly aligned, and uniquely owned here.
// The caller guaranteed these conditions in the function contract.
unsafe {
    std::ptr::write(ptr, value);
}
```

If you cannot write a clear safety comment, reconsider whether `unsafe` is necessary.
