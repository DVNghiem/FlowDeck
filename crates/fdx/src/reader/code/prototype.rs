use crate::reader::code::languages::{detect_language, get_language_provider};
use crate::reader::code::Symbol;
use std::path::Path;
use tree_sitter::Node;

/// Maximum characters in a reported signature.
///
/// Backstop for shapes where no body node can be located: without a cap, an
/// entire function body would be spliced onto one line.
pub const MAX_SIGNATURE_CHARS: usize = 200;

/// Node kinds that begin a declaration's body, across all supported grammars.
///
/// `statement_block` is the JavaScript/TypeScript function body; its absence from
/// the original list is why every JS/TS signature previously included its body.
const BODY_KINDS: &[&str] = &[
    "block",
    "statement_block",
    "class_body",
    "interface_body",
    "enum_body",
    "function_body",
    "constructor_body",
    "declaration_list",
    "field_declaration_list",
];

/// Extract the signature (declaration without body) of a symbol.
pub fn extract_signature(node: Node, source: &str) -> String {
    let end_byte = signature_end(node).unwrap_or_else(|| node.end_byte());
    let signature_text = &source[node.start_byte()..end_byte];
    let joined = signature_text
        .lines()
        .map(|l| l.trim())
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['{', '('])
        .trim()
        .to_string();
    truncate_chars(&joined, MAX_SIGNATURE_CHARS)
}

/// Offset where a declaration's body begins, so the signature can stop there.
///
/// Prefers the node's own `body` field, then a body reachable through `value`
/// (the `const f = (x) => {...}` shape, where a query captures the
/// `variable_declarator` and the body is a grandchild), then a depth-bounded
/// search for a known body kind.
///
/// Returns `None` when the declaration genuinely has no body, e.g. a Rust unit
/// `struct Foo;` or a TypeScript `function_signature`.
fn signature_end(node: Node) -> Option<usize> {
    if let Some(body) = node.child_by_field_name("body") {
        return Some(body.start_byte());
    }
    if let Some(body) = node
        .child_by_field_name("value")
        .and_then(|value| value.child_by_field_name("body"))
    {
        return Some(body.start_byte());
    }
    find_body_by_kind(node, 3).map(|n| n.start_byte())
}

/// Breadth-first, depth-bounded search for a body node.
///
/// Shallowest match wins and the depth limit is small, so a nested closure's body
/// cannot be mistaken for this declaration's body.
fn find_body_by_kind<'a>(node: Node<'a>, depth: usize) -> Option<Node<'a>> {
    if depth == 0 {
        return None;
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if BODY_KINDS.contains(&child.kind()) {
            return Some(child);
        }
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if let Some(found) = find_body_by_kind(child, depth - 1) {
            return Some(found);
        }
    }
    None
}

/// Truncate to `max` characters on a char boundary, marking elision.
fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let kept: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{kept}…")
}

/// Extract doc comment immediately preceding a symbol.
pub fn extract_doc_comment(node: Node, source: &str) -> Option<String> {
    let start_line = node.start_position().row;
    let lines: Vec<&str> = source.lines().collect();
    let mut doc_lines = Vec::new();

    for i in (0..start_line).rev() {
        let line = lines.get(i)?;
        let trimmed = line.trim();

        if trimmed.starts_with("///") {
            doc_lines.push(trimmed.trim_start_matches("///").trim().to_string());
        } else if trimmed.starts_with("//") {
            doc_lines.push(trimmed.trim_start_matches("//").trim().to_string());
        } else if trimmed.starts_with("#") {
            doc_lines.push(trimmed.trim_start_matches("#").trim().to_string());
        } else if trimmed.starts_with("/*") && trimmed.ends_with("*/") {
            let inner = trimmed
                .trim_start_matches("/*")
                .trim_end_matches("*/")
                .trim();
            doc_lines.push(inner.to_string());
            break;
        } else if trimmed.is_empty() {
            continue;
        } else {
            break;
        }
    }

    if doc_lines.is_empty() {
        return None;
    }

    doc_lines.reverse();
    Some(doc_lines.join("\n"))
}

/// Get the text of a node from the source.
pub fn node_text(node: Node, source: &str) -> String {
    source[node.start_byte()..node.end_byte()].to_string()
}


pub struct PrototypeReader;

impl PrototypeReader {
    pub fn new() -> Self {
        Self
    }

    pub fn extract_prototypes(
        &self,
        path: &Path,
        source: &str,
        tree: &tree_sitter::Tree,
    ) -> anyhow::Result<Vec<Symbol>> {
        let provider = detect_language(path)
            .or_else(|| {
                path.extension()
                    .and_then(|e| e.to_str())
                    .and_then(get_language_provider)
            })
            .ok_or_else(|| anyhow::anyhow!("Unsupported language for prototype extraction"))?;

        // Query patterns are unanchored, so symbols nested under
        // `export_statement`, `decorated_definition`, `declaration_list`, or
        // `class_body` are found without any wrapper-unwrapping code.
        let query = super::queries::symbol_query(provider.name).ok_or_else(|| {
            anyhow::anyhow!("No symbol query available for language '{}'", provider.name)
        })?;
        let found = super::queries::find_symbols_via_query(tree, source, query);
        let mut symbols = Vec::new();

        for (node, kind, name) in found {
            let signature = extract_signature(node, source);
            let doc_comment = extract_doc_comment(node, source);
            let line_start = node.start_position().row + 1;
            let line_end = node.end_position().row + 1;

            symbols.push(Symbol {
                kind,
                name,
                signature,
                doc_comment,
                line_start,
                line_end,
                body: None,
            });
        }

        Ok(symbols)
    }
}
