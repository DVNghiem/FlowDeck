# Testing Patterns

**Analysis Date:** 2026-06-26

## Test Framework

**Runner:**
- TypeScript: Vitest 4.1.8
- Rust: Built-in `cargo test`

**Assertion Library:**
- TypeScript: Vitest built-in (`expect`)
- Rust: Standard `assert!`, `assert_eq!`

**Run Commands:**
```bash
bun test              # Run all TypeScript tests
cargo test            # Run all Rust tests
cargo test --lib      # Rust unit tests only
```

## Test File Organization

**Location:**
- Rust: Separate `tests/` directory (`crates/fdx/tests/`)
- TypeScript: Co-located or in `tests/` (inferred)

**Naming:**
- Rust: `test_{module}.rs` (e.g., `test_batch.rs`, `test_grep.rs`)
- TypeScript: `*.test.ts` or `*.spec.ts`

**Structure:**
```
crates/fdx/tests/
├── test_batch.rs
├── test_cache.rs
├── test_core.rs
├── test_deep.rs
├── test_diff.rs
├── test_git.rs
├── test_grep.rs
├── test_impact.rs
├── test_lint.rs
├── test_ls.rs
├── test_outline.rs
├── test_output.rs
├── test_prototype.rs
├── test_search.rs
├── test_test_runner.rs
└── test_tree.rs
```

## Test Structure

**Suite Organization:**
```rust
// Rust pattern from test files
#[test]
fn test_name() {
    // Arrange
    let input = ...;
    
    // Act
    let result = function_under_test(input);
    
    // Assert
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), expected);
}
```

**Patterns:**
- Rust: `#[test]` functions in `tests/` files
- Each test file focuses on one module/command
- Integration tests exercise the public API

## Mocking

**Framework:**
- Rust: Minimal mocking observed — tests use real filesystem operations
- TypeScript: Not examined in detail

**Patterns:**
- Rust tests use temporary files (`tempfile` crate)
- Real tree-sitter parsing in tests

## Fixtures and Factories

**Test Data:**
- Rust: Inline test data within test functions
- Temporary directories created via `tempfile::tempdir()`

**Location:**
- Test data embedded in test files

## Coverage

**Requirements:**
- No explicit coverage target configured
- 16 Rust integration test files covering all major commands

**View Coverage:**
```bash
cargo llvm-cov        # If cargo-llvm-cov installed
```

## Test Types

**Unit Tests:**
- Rust: `#[cfg(test)]` modules within source files (minimal)
- Most testing is integration-level

**Integration Tests:**
- Rust: 16 test files in `crates/fdx/tests/`
- Cover: batch, cache, core, deep, diff, git, grep, impact, lint, ls, outline, output, prototype, search, test_runner, tree

**E2E Tests:**
- Not detected

## Common Patterns

**Async Testing:**
- TypeScript: `async/await` with Vitest
- Rust: Synchronous tests (no async observed)

**Error Testing:**
```rust
// Rust pattern
let result = function_that_fails(bad_input);
assert!(result.is_err());
```

**Command Testing:**
- Each fdx command has a dedicated test file
- Tests exercise both text and JSON output formats

---

*Testing analysis: 2026-06-26*
