use fdx::reader::code::{
    deep::DeepReader, parser::parse_source, CodeReader,
};

/// Deep mode must resolve a symbol nested under a wrapper node.
///
/// `deep.rs` called `find_symbols_in_tree` directly, which walked only
/// `root.children()`, so `fdx read --mode deep --symbol exportedFn` errored with
/// "Symbol not found" for any `export function` in a TypeScript file.
#[test]
fn deep_mode_finds_exported_typescript_symbol() {
    let source = r#"
export function exportedFn(a: number): number {
  return a + 1;
}

export class Svc {
  doThing(): void {}
}
"#;
    let tree = parse_source(source, tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()).unwrap();
    let reader = DeepReader::new();

    let result = reader
        .read_deep(
            std::path::Path::new("test.ts"),
            source,
            &tree,
            Some("exportedFn"),
            false,
        )
        .expect("exported symbol must be findable in deep mode");
    assert_eq!(result.symbols.len(), 1);
    assert_eq!(result.symbols[0].name, "exportedFn");
    assert_eq!(result.symbols[0].kind, "function");
    assert!(
        result.symbols[0]
            .body
            .as_deref()
            .is_some_and(|b| b.contains("return a + 1")),
        "deep mode must include the body"
    );
}

/// A method inside a class body must also be reachable by name.
#[test]
fn deep_mode_finds_class_method() {
    let source = r#"
export class Svc {
  doThing(): number { return 7; }
}
"#;
    let tree = parse_source(source, tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()).unwrap();
    let reader = DeepReader::new();

    let result = reader
        .read_deep(
            std::path::Path::new("test.ts"),
            source,
            &tree,
            Some("doThing"),
            false,
        )
        .expect("class method must be findable in deep mode");
    assert_eq!(result.symbols.len(), 1);
    assert_eq!(result.symbols[0].name, "doThing");
    assert_eq!(result.symbols[0].kind, "method");
}

#[test]
fn test_deep_mode_with_symbol() {
    let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    let base = amount * rate;
    Fee { amount: base }
}
"#;
    let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
    let reader = DeepReader::new();
    let result = reader
        .read_deep(
            std::path::Path::new("test.rs"),
            source,
            &tree,
            Some("calculate_fee"),
            false,
        )
        .unwrap();

    assert_eq!(result.symbols.len(), 1);
    assert_eq!(result.symbols[0].name, "calculate_fee");
    assert!(result.symbols[0].body.is_some());
    let body = result.symbols[0].body.as_ref().unwrap();
    assert!(body.contains("let base = amount * rate"));
    assert!(body.contains("Fee { amount: base }"));
    assert!(result.dependencies.is_empty());
}

#[test]
fn test_deep_mode_all_symbols() {
    let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    Fee { amount: amount * rate }
}
"#;
    let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
    let reader = DeepReader::new();
    let result = reader
        .read_deep(std::path::Path::new("test.rs"), source, &tree, None, false)
        .unwrap();

    assert_eq!(result.symbols.len(), 2);
    // All symbols should have bodies
    for sym in &result.symbols {
        assert!(
            sym.body.is_some(),
            "Symbol {} should have a body",
            sym.name
        );
    }
}

#[test]
fn test_deep_mode_with_dependencies() {
    let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    let base = amount * rate;
    Fee { amount: base }
}
"#;
    let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
    let reader = DeepReader::new();
    let result = reader
        .read_deep(
            std::path::Path::new("test.rs"),
            source,
            &tree,
            Some("calculate_fee"),
            true,
        )
        .unwrap();

    assert_eq!(result.symbols.len(), 1);
    assert!(!result.dependencies.is_empty());

    // Fee should be resolved as a same-file dependency
    let fee_dep = result
        .dependencies
        .iter()
        .find(|d| d.name == "Fee")
        .expect("Fee should be a dependency");
    assert_eq!(fee_dep.kind, "type_ref");
    assert_eq!(fee_dep.source.as_deref(), Some("same_file"));
    assert!(fee_dep.prototype.is_some());
    let proto = fee_dep.prototype.as_ref().unwrap();
    assert_eq!(proto.name, "Fee");
    assert_eq!(proto.kind, "class");
}

#[test]
fn test_deep_mode_no_deps() {
    let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    let base = amount * rate;
    Fee { amount: base }
}
"#;
    let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
    let reader = DeepReader::new();
    let result = reader
        .read_deep(
            std::path::Path::new("test.rs"),
            source,
            &tree,
            Some("calculate_fee"),
            false,
        )
        .unwrap();

    assert!(result.dependencies.is_empty());
}

#[test]
fn test_deep_mode_symbol_not_found() {
    let source = r#"
pub fn foo() {}
"#;
    let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
    let reader = DeepReader::new();
    let result = reader.read_deep(
        std::path::Path::new("test.rs"),
        source,
        &tree,
        Some("nonexistent"),
        false,
    );

    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("nonexistent"));
    assert!(err.contains("not found"));
}
