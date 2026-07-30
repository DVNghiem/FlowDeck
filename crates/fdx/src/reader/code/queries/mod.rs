//! Compiled tree-sitter queries for symbol extraction.
//!
//! These replace a hand-rolled recursive walk. tree-sitter query patterns are
//! **unanchored** by default, so `(method_declaration name: (_) @name)` matches at
//! any depth. That is what fixes nested-symbol recall without any code that knows
//! about `export_statement`, `decorated_definition`, `declaration_list`, or
//! `class_body`.
//!
//! Each `.scm` file is a compile-time constant embedded with `include_str!`, and
//! each `Query` is compiled once per process. Compiling per file would dominate
//! build time, since `Query::new` parses the S-expression source.

use once_cell::sync::Lazy;
use std::collections::BTreeMap;
use tree_sitter::{Node, Query, QueryCursor, StreamingIterator, Tree};

const JAVASCRIPT_SCM: &str = include_str!("javascript.scm");
/// TypeScript reuses the JavaScript patterns verbatim and appends its own.
///
/// Every node type and field in `javascript.scm` exists in the TypeScript
/// grammar, verified against its `node-types.json`, so the concatenation
/// compiles against `LANGUAGE_TYPESCRIPT`.
const TYPESCRIPT_SCM: &str = concat!(
    include_str!("javascript.scm"),
    include_str!("typescript_extra.scm")
);
const RUST_SCM: &str = include_str!("rust.scm");
const PYTHON_SCM: &str = include_str!("python.scm");
const JAVA_SCM: &str = include_str!("java.scm");

/// Import patterns. TypeScript reuses the JavaScript file unchanged, since
/// `import_statement`, `export_statement`, and `call_expression` are identical in
/// both grammars.
const IMPORTS_JAVASCRIPT_SCM: &str = include_str!("imports_javascript.scm");
const IMPORTS_RUST_SCM: &str = include_str!("imports_rust.scm");
const IMPORTS_PYTHON_SCM: &str = include_str!("imports_python.scm");
const IMPORTS_JAVA_SCM: &str = include_str!("imports_java.scm");

/// Compile a built-in query.
///
/// Panics if the query fails to compile. The `.scm` sources are compile-time
/// constants checked into this crate, so a failure here is an internal invariant
/// violation (a grammar upgrade renamed a node type), never bad user input. The
/// panic message names the file and the tree-sitter error so the fix is obvious.
fn compile(name: &str, language: tree_sitter::Language, source: &str) -> Query {
    Query::new(&language, source)
        .unwrap_or_else(|e| panic!("built-in query {name}.scm failed to compile: {e}"))
}

static JAVASCRIPT_QUERY: Lazy<Query> = Lazy::new(|| {
    compile(
        "javascript",
        tree_sitter_javascript::LANGUAGE.into(),
        JAVASCRIPT_SCM,
    )
});
static TYPESCRIPT_QUERY: Lazy<Query> = Lazy::new(|| {
    compile(
        "typescript",
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        TYPESCRIPT_SCM,
    )
});
static RUST_QUERY: Lazy<Query> =
    Lazy::new(|| compile("rust", tree_sitter_rust::LANGUAGE.into(), RUST_SCM));
static PYTHON_QUERY: Lazy<Query> =
    Lazy::new(|| compile("python", tree_sitter_python::LANGUAGE.into(), PYTHON_SCM));
static JAVA_QUERY: Lazy<Query> =
    Lazy::new(|| compile("java", tree_sitter_java::LANGUAGE.into(), JAVA_SCM));

static IMPORTS_JAVASCRIPT_QUERY: Lazy<Query> = Lazy::new(|| {
    compile(
        "imports_javascript",
        tree_sitter_javascript::LANGUAGE.into(),
        IMPORTS_JAVASCRIPT_SCM,
    )
});
static IMPORTS_TYPESCRIPT_QUERY: Lazy<Query> = Lazy::new(|| {
    compile(
        "imports_javascript(typescript)",
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        IMPORTS_JAVASCRIPT_SCM,
    )
});
static IMPORTS_RUST_QUERY: Lazy<Query> = Lazy::new(|| {
    compile(
        "imports_rust",
        tree_sitter_rust::LANGUAGE.into(),
        IMPORTS_RUST_SCM,
    )
});
static IMPORTS_PYTHON_QUERY: Lazy<Query> = Lazy::new(|| {
    compile(
        "imports_python",
        tree_sitter_python::LANGUAGE.into(),
        IMPORTS_PYTHON_SCM,
    )
});
static IMPORTS_JAVA_QUERY: Lazy<Query> = Lazy::new(|| {
    compile(
        "imports_java",
        tree_sitter_java::LANGUAGE.into(),
        IMPORTS_JAVA_SCM,
    )
});

/// A raw import specifier located by a query, before path resolution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawImport {
    /// Specifier text with quotes already stripped, e.g. `./b`, `crate::fee::Fee`.
    pub specifier: String,
    /// 1-indexed line of the import statement.
    pub line: usize,
}

/// The compiled import query for a `LanguageProvider::name`, if one exists.
pub fn import_query(language_name: &str) -> Option<&'static Query> {
    match language_name {
        "javascript" => Some(&IMPORTS_JAVASCRIPT_QUERY),
        "typescript" => Some(&IMPORTS_TYPESCRIPT_QUERY),
        "rust" => Some(&IMPORTS_RUST_QUERY),
        "python" => Some(&IMPORTS_PYTHON_QUERY),
        "java" => Some(&IMPORTS_JAVA_QUERY),
        _ => None,
    }
}

/// Find all import specifiers in `tree`, source-ordered and deduped by position.
///
/// Handles both quote styles and multi-line statements, because it matches AST
/// nodes rather than scanning lines.
pub fn find_imports_via_query(tree: &Tree, source: &str, query: &Query) -> Vec<RawImport> {
    let capture_names = query.capture_names();
    let mut cursor = QueryCursor::new();
    let mut found: BTreeMap<usize, RawImport> = BTreeMap::new();

    let mut matches = cursor.matches(query, tree.root_node(), source.as_bytes());
    while let Some(m) = matches.next() {
        let mut specifier: Option<String> = None;
        let mut anchor: Option<(Node, &str)> = None;

        for capture in m.captures {
            let capture_name = capture_names[capture.index as usize];
            if capture_name == "import.source" {
                specifier = Some(source[capture.node.byte_range()].to_string());
            } else if let Some(suffix) = capture_name.strip_prefix("import") {
                anchor = Some((capture.node, suffix.trim_start_matches('.')));
            }
        }

        let (Some(specifier), Some((node, suffix))) = (specifier, anchor) else {
            continue;
        };
        // `mod foo { ... }` declares a module inline; only bodyless `mod foo;`
        // refers to another file.
        if suffix == "mod" && node.child_by_field_name("body").is_some() {
            continue;
        }
        if specifier.is_empty() {
            continue;
        }

        found.entry(node.start_byte()).or_insert(RawImport {
            specifier,
            line: node.start_position().row + 1,
        });
    }

    found.into_values().collect()
}

/// The compiled symbol query for a `LanguageProvider::name`, if one exists.
///
/// Returns `None` for languages without a query file, so callers can fall back
/// rather than fail.
pub fn symbol_query(language_name: &str) -> Option<&'static Query> {
    match language_name {
        "javascript" => Some(&JAVASCRIPT_QUERY),
        "typescript" => Some(&TYPESCRIPT_QUERY),
        "rust" => Some(&RUST_QUERY),
        "python" => Some(&PYTHON_QUERY),
        "java" => Some(&JAVA_QUERY),
        _ => None,
    }
}

/// Map a `@definition.<suffix>` capture to the kind string used by `Symbol::kind`.
///
/// These strings are a published contract: `fdx search --kind`, `fdx outline
/// --kind`, and the JSON output all match on them, so they intentionally mirror
/// what the previous `map_kind` produced (notably Rust `struct` reporting as
/// "class").
fn kind_string(suffix: &str) -> Option<&'static str> {
    match suffix {
        "function" => Some("function"),
        "method" => Some("method"),
        "class" => Some("class"),
        "interface" => Some("interface"),
        "trait" => Some("trait"),
        "enum" => Some("enum"),
        "type" => Some("type"),
        "module" => Some("module"),
        "constant" => Some("const"),
        "static" => Some("static"),
        "macro" => Some("macro"),
        "impl" => Some("impl"),
        _ => None,
    }
}

/// Specificity of a kind, used to break ties when two patterns capture the same node.
///
/// The free-function patterns are unanchored, so they also match methods inside a
/// Rust `impl` or a Python `class`. When both fire on one node, "method" wins.
fn kind_rank(kind: &str) -> u8 {
    match kind {
        "method" => 2,
        _ => 1,
    }
}

/// Find all symbol definitions in `tree` using a compiled query.
///
/// Returns `(node, kind, name)` triples sorted by source position, matching the
/// shape the previous walk returned so callers need minimal change.
///
/// Nodes captured by more than one pattern are deduped by start offset, keeping
/// the most specific kind.
pub fn find_symbols_via_query<'tree>(
    tree: &'tree Tree,
    source: &str,
    query: &Query,
) -> Vec<(Node<'tree>, String, String)> {
    let capture_names = query.capture_names();
    let mut cursor = QueryCursor::new();
    // Keyed by start offset so output is source-ordered and duplicates collapse.
    let mut found: BTreeMap<usize, (Node<'tree>, String, String)> = BTreeMap::new();

    let mut matches = cursor.matches(query, tree.root_node(), source.as_bytes());
    while let Some(m) = matches.next() {
        let mut definition: Option<(Node<'tree>, &'static str)> = None;
        let mut name: Option<String> = None;

        for capture in m.captures {
            let capture_name = capture_names[capture.index as usize];
            if let Some(suffix) = capture_name.strip_prefix("definition.") {
                if let Some(kind) = kind_string(suffix) {
                    definition = Some((capture.node, kind));
                }
            } else if capture_name == "name" {
                name = Some(source[capture.node.byte_range()].to_string());
            }
        }

        let (Some((node, kind)), Some(name)) = (definition, name) else {
            continue;
        };
        if name.is_empty() {
            continue;
        }

        let key = node.start_byte();
        match found.get(&key) {
            Some((_, existing_kind, _)) if kind_rank(existing_kind) >= kind_rank(kind) => {}
            _ => {
                found.insert(key, (node, kind.to_string(), name));
            }
        }
    }

    found.into_values().collect()
}
