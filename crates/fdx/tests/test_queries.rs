//! Query compilation and call-shape extraction.
//!
//! The compilation test matters because a `.scm` file with a renamed node type or
//! a bad field name is a hard panic on FIRST USE, not a build error. Without this
//! test, a grammar upgrade would ship and then panic in a user's session.

use fdx::reader::code::{
    parser::parse_source,
    queries::{
        call_query, find_calls_via_query, find_imports_via_query, import_query, symbol_query,
        RawCallShape,
    },
};

const LANGUAGES: &[&str] = &["javascript", "typescript", "rust", "python", "java"];

#[test]
fn every_symbol_query_compiles() {
    for lang in LANGUAGES {
        assert!(
            symbol_query(lang).is_some(),
            "no symbol query registered for {lang}"
        );
    }
}

#[test]
fn every_import_query_compiles() {
    for lang in LANGUAGES {
        assert!(
            import_query(lang).is_some(),
            "no import query registered for {lang}"
        );
    }
}

#[test]
fn every_call_query_compiles() {
    for lang in LANGUAGES {
        assert!(
            call_query(lang).is_some(),
            "no call query registered for {lang}"
        );
    }
}

#[test]
fn unknown_language_has_no_queries() {
    assert!(symbol_query("cobol").is_none());
    assert!(import_query("cobol").is_none());
    assert!(call_query("cobol").is_none());
}

/// Reduce calls to a sorted `(shape, name)` set.
fn calls(source: &str, lang: &str, language: tree_sitter::Language) -> Vec<(RawCallShape, String)> {
    let tree = parse_source(source, language).expect("fixture must parse");
    let query = call_query(lang).expect("language must have a call query");
    let mut got: Vec<(RawCallShape, String)> = find_calls_via_query(&tree, source, query)
        .into_iter()
        .map(|c| (c.shape, c.callee_name))
        .collect();
    got.sort_by(|a, b| a.1.cmp(&b.1).then((a.0 as u8).cmp(&(b.0 as u8))));
    got
}

#[test]
fn typescript_call_shapes_are_distinguished() {
    let source = r#"
function run() {
  free();
  obj.method();
  const x = new Widget();
}
"#;
    let got = calls(
        source,
        "typescript",
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
    );
    assert!(
        got.contains(&(RawCallShape::Unqualified, "free".to_string())),
        "expected unqualified `free`, got {got:?}"
    );
    assert!(
        got.contains(&(RawCallShape::Qualified, "method".to_string())),
        "expected qualified `method`, got {got:?}"
    );
    assert!(
        got.contains(&(RawCallShape::Constructor, "Widget".to_string())),
        "expected constructor `Widget`, got {got:?}"
    );
}

/// `require` is excluded so it doesn't masquerade as a normal function call.
#[test]
fn javascript_excludes_require_from_calls() {
    let source = "const fs = require('fs');\nfunction go() { real(); }\n";
    let got = calls(
        source,
        "javascript",
        tree_sitter_javascript::LANGUAGE.into(),
    );
    assert!(
        !got.iter().any(|(_, n)| n == "require"),
        "require must not be a call edge, got {got:?}"
    );
    assert!(got.contains(&(RawCallShape::Unqualified, "real".to_string())));
}

#[test]
fn rust_call_shapes_are_distinguished() {
    let source = r#"
fn run(x: Thing) {
    free();
    Foo::assoc();
    x.method();
}
"#;
    let got = calls(source, "rust", tree_sitter_rust::LANGUAGE.into());
    assert!(
        got.contains(&(RawCallShape::Unqualified, "free".to_string())),
        "expected unqualified `free`, got {got:?}"
    );
    assert!(
        got.contains(&(RawCallShape::PathScoped, "assoc".to_string())),
        "expected path-scoped `assoc`, got {got:?}"
    );
    assert!(
        got.contains(&(RawCallShape::Qualified, "method".to_string())),
        "expected qualified `method`, got {got:?}"
    );
}

#[test]
fn python_call_shapes_are_distinguished() {
    let source = "def run(x):\n    free()\n    x.method()\n";
    let got = calls(source, "python", tree_sitter_python::LANGUAGE.into());
    assert!(got.contains(&(RawCallShape::Unqualified, "free".to_string())));
    assert!(got.contains(&(RawCallShape::Qualified, "method".to_string())));
}

/// Java's unqualified pattern uses a negated `!object` field. Without it, the
/// pattern would also match `obj.foo()` and every receiver call would be
/// misreported as a bare call, which would then earn High confidence it hasn't
/// earned.
#[test]
fn java_unqualified_pattern_excludes_receiver_calls() {
    let source = r#"
class Probe {
    void run() {
        free();
        obj.method();
        Widget w = new Widget();
    }
}
"#;
    let got = calls(source, "java", tree_sitter_java::LANGUAGE.into());
    assert!(
        got.contains(&(RawCallShape::Unqualified, "free".to_string())),
        "expected unqualified `free`, got {got:?}"
    );
    assert!(
        got.contains(&(RawCallShape::Qualified, "method".to_string())),
        "expected qualified `method`, got {got:?}"
    );
    assert!(
        !got.contains(&(RawCallShape::Unqualified, "method".to_string())),
        "`obj.method()` must NOT be reported as unqualified, got {got:?}"
    );
    assert!(
        got.contains(&(RawCallShape::Constructor, "Widget".to_string())),
        "expected constructor `Widget`, got {got:?}"
    );
}

/// Extracted import specifiers, in source order.
fn imports(source: &str, lang: &str, language: tree_sitter::Language) -> Vec<String> {
    let tree = parse_source(source, language).expect("fixture must parse");
    let query = import_query(lang).expect("language must have an import query");
    find_imports_via_query(&tree, source, query)
        .into_iter()
        .map(|i| i.specifier)
        .collect()
}

/// Before this, Python/Java/Rust import extraction had COMPILE-only coverage:
/// `import_query(lang).is_some()`. A capture rename still compiled and silently
/// yielded zero imports, which is the exact silent-empty failure mode the
/// query rewrite existed to eliminate for TypeScript.
#[test]
fn python_import_forms_are_extracted() {
    let got = imports(
        "import os\nfrom .b import bee\nfrom pkg.mod import x\n",
        "python",
        tree_sitter_python::LANGUAGE.into(),
    );
    assert_eq!(got, vec!["os", ".b", "pkg.mod"], "got {got:?}");
}

#[test]
fn java_import_forms_are_extracted() {
    let got = imports(
        "package a;\nimport com.example.Fee;\nimport com.other.Thing;\n",
        "java",
        tree_sitter_java::LANGUAGE.into(),
    );
    assert_eq!(
        got,
        vec!["com.example.Fee", "com.other.Thing"],
        "got {got:?}"
    );
}

/// A wildcard import has an `asterisk` child rather than a name, so it must be
/// skipped rather than producing a bogus specifier.
#[test]
fn java_wildcard_imports_are_skipped() {
    let got = imports(
        "package a;\nimport com.example.*;\nimport com.other.Thing;\n",
        "java",
        tree_sitter_java::LANGUAGE.into(),
    );
    assert_eq!(got, vec!["com.other.Thing"], "got {got:?}");
}

#[test]
fn rust_mod_and_use_are_both_extracted() {
    let got = imports(
        "mod fee;\nuse crate::fee::Fee;\nuse super::sibling;\n",
        "rust",
        tree_sitter_rust::LANGUAGE.into(),
    );
    assert_eq!(
        got,
        vec!["fee", "crate::fee::Fee", "super::sibling"],
        "got {got:?}"
    );
}

/// `mod foo { .. }` declares a module inline; only a bodyless `mod foo;` refers
/// to another file, so the bodied form must not become an import.
#[test]
fn rust_inline_mod_is_not_an_import() {
    let got = imports(
        "mod inline { pub fn x() {} }\nmod external;\n",
        "rust",
        tree_sitter_rust::LANGUAGE.into(),
    );
    assert_eq!(got, vec!["external"], "got {got:?}");
}

#[test]
fn typescript_import_forms_are_extracted() {
    let got = imports(
        "import { a } from './x';\nimport b from \"./y\";\nexport { c } from './z';\n",
        "typescript",
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
    );
    assert_eq!(got, vec!["./x", "./y", "./z"], "got {got:?}");
}
