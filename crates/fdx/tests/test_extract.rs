//! Symbol-extraction recall tests.
//!
//! These exist because `find_symbols_in_tree` originally walked only
//! `root.children()`, so every symbol nested under a wrapper node was invisible:
//! `export_statement` (TS/JS), `decorated_definition` (Python), `declaration_list`
//! (Rust `impl`), and `class_body` (Java/TS). Measured recall before the fix was
//! TS 1/5, Java 2/4 (zero methods), Python 2/4, Rust 3/5.
//!
//! Each test asserts the FULL expected symbol set as (kind, name) pairs, so a
//! regression shows up as a diff rather than as a count that happens to match.

use fdx::reader::code::{parser::parse_source, prototype::PrototypeReader};
use std::path::Path;

/// Extract and reduce to a sorted `(kind, name)` set for order-independent comparison.
fn extract(path: &str, source: &str, lang: tree_sitter::Language) -> Vec<(String, String)> {
    let tree = parse_source(source, lang).expect("fixture source must parse");
    let reader = PrototypeReader::new();
    let symbols = reader
        .extract_prototypes(Path::new(path), source, &tree)
        .expect("fixture language must be supported");
    let mut pairs: Vec<(String, String)> = symbols
        .into_iter()
        .map(|s| (s.kind, s.name))
        .collect();
    pairs.sort();
    pairs
}

fn expect(actual: Vec<(String, String)>, want: &[(&str, &str)]) {
    let mut want: Vec<(String, String)> = want
        .iter()
        .map(|(k, n)| (k.to_string(), n.to_string()))
        .collect();
    want.sort();
    assert_eq!(actual, want);
}

#[test]
fn typescript_finds_exported_and_nested_symbols() {
    let source = r#"
import { helper } from './other';

export function exportedFn(a: number): number {
  return helper(a);
}

function plainFn(): void {
  exportedFn(1);
}

export class Svc {
  doThing(): void { plainFn(); }
}

export const arrow = (x: number) => x * 2;
"#;
    let got = extract("probe.ts", source, tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into());
    expect(
        got,
        &[
            ("function", "exportedFn"),
            ("function", "plainFn"),
            ("class", "Svc"),
            ("method", "doThing"),
            ("function", "arrow"),
        ],
    );
}

#[test]
fn javascript_finds_class_methods_and_arrow_consts() {
    let source = r#"
export function exportedFn(a) {
  return a;
}

export class Svc {
  doThing() { return 1; }
}

export const arrow = (x) => x * 2;
"#;
    let got = extract("probe.js", source, tree_sitter_javascript::LANGUAGE.into());
    expect(
        got,
        &[
            ("function", "exportedFn"),
            ("class", "Svc"),
            ("method", "doThing"),
            ("function", "arrow"),
        ],
    );
}

#[test]
fn rust_finds_impl_block_methods() {
    let source = r#"
pub struct Foo;

impl Foo {
    pub fn method_a(&self) -> u32 { helper() }
}

pub fn top_level() -> u32 { 1 }

fn helper() -> u32 { 2 }
"#;
    let got = extract("probe.rs", source, tree_sitter_rust::LANGUAGE.into());
    expect(
        got,
        &[
            ("class", "Foo"),
            ("impl", "Foo"),
            ("method", "method_a"),
            ("function", "top_level"),
            ("function", "helper"),
        ],
    );
}

#[test]
fn python_finds_decorated_functions_and_methods() {
    let source = r#"
def plain_fn():
    return helper()

@decorator
def decorated_fn():
    return 1

class Svc:
    def method_a(self):
        return plain_fn()
"#;
    let got = extract("probe.py", source, tree_sitter_python::LANGUAGE.into());
    expect(
        got,
        &[
            ("function", "plain_fn"),
            ("function", "decorated_fn"),
            ("class", "Svc"),
            ("method", "method_a"),
        ],
    );
}

#[test]
fn java_finds_every_method() {
    let source = r#"
package com.example;

public class Probe {
    public int methodA() { return helper(); }
    private int helper() { return 1; }
}

interface Thing { void doIt(); }
"#;
    let got = extract("Probe.java", source, tree_sitter_java::LANGUAGE.into());
    expect(
        got,
        &[
            ("class", "Probe"),
            ("method", "methodA"),
            ("method", "helper"),
            ("interface", "Thing"),
            ("method", "doIt"),
        ],
    );
}

/// A long arrow function must report a one-line signature, not its whole body.
///
/// The query captures a `variable_declarator` for `const f = () => {...}`, and the
/// `block` is a grandchild, so a direct-children-only body lookup fell through to
/// `node.end_byte()` and returned the entire function as the "signature".
#[test]
fn arrow_function_signature_excludes_body() {
    let body: String = (0..50)
        .map(|i| format!("  const v{i} = {i};\n"))
        .collect();
    let source = format!("export const big = (x: number) => {{\n{body}  return x;\n}};\n");
    let tree = parse_source(&source, tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into())
        .expect("fixture source must parse");
    let reader = PrototypeReader::new();
    let symbols = reader
        .extract_prototypes(Path::new("probe.ts"), &source, &tree)
        .expect("typescript must be supported");

    let big = symbols
        .iter()
        .find(|s| s.name == "big")
        .expect("`big` must be extracted");
    assert!(
        !big.signature.contains("const v0"),
        "signature leaked the function body: {:?}",
        big.signature
    );
    assert!(
        big.signature.len() < 120,
        "signature should be short, got {} chars: {:?}",
        big.signature.len(),
        big.signature
    );
}
