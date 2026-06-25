use crate::reader::code::{
    find_symbols_in_tree, node_text, extract_doc_comment, extract_signature,
    languages::{detect_language, get_language_provider},
    CodeReader, CodeResult, Dependency, Symbol,
};
use std::collections::HashSet;
use std::path::Path;
use tree_sitter::{Node, Tree};

pub struct DeepReader;

impl DeepReader {
    pub fn new() -> Self {
        Self
    }

    /// Collect all identifier names referenced inside a node (excluding the symbol's own name).
    fn collect_references(node: Node, source: &str, exclude_name: &str) -> Vec<String> {
        let mut refs = Vec::new();
        let mut seen = HashSet::new();

        // Walk the entire subtree
        Self::walk_for_references(node, source, exclude_name, &mut seen, &mut refs);

        refs
    }

    fn walk_for_references(
        node: Node,
        source: &str,
        exclude_name: &str,
        seen: &mut HashSet<String>,
        refs: &mut Vec<String>,
    ) {
        // Skip comment nodes
        let kind = node.kind();
        if kind.contains("comment") || kind == "string" || kind == "string_literal" {
            return;
        }

        // Collect identifier references
        if kind == "identifier" || kind == "type_identifier" {
            let name = node_text(node, source);
            if name != exclude_name && !seen.contains(&name) {
                seen.insert(name.clone());
                refs.push(name);
            }
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            Self::walk_for_references(child, source, exclude_name, seen, refs);
        }
    }

    /// Build a Symbol with full body included.
    fn build_symbol_with_body(
        node: Node,
        source: &str,
        kind: String,
        name: String,
    ) -> Symbol {
        let signature = extract_signature(node, source);
        let doc_comment = extract_doc_comment(node, source);
        let line_start = node.start_position().row + 1;
        let line_end = node.end_position().row + 1;
        let body = Some(node_text(node, source));

        Symbol {
            kind,
            name,
            signature,
            doc_comment,
            line_start,
            line_end,
            body,
        }
    }
}

impl CodeReader for DeepReader {
    fn read_prototypes(
        &self,
        _path: &Path,
        _source: &str,
        _tree: &Tree,
    ) -> anyhow::Result<Vec<Symbol>> {
        Ok(vec![])
    }

    fn read_deep(
        &self,
        path: &Path,
        source: &str,
        tree: &Tree,
        symbol_name: Option<&str>,
        with_deps: bool,
    ) -> anyhow::Result<CodeResult> {
        let provider = detect_language(path)
            .or_else(|| {
                path.extension()
                    .and_then(|e| e.to_str())
                    .and_then(get_language_provider)
            })
            .ok_or_else(|| anyhow::anyhow!("Unsupported language for deep mode"))?;

        let all_symbols = find_symbols_in_tree(tree, source, &provider.symbol_node_types);
        let total_lines = source.lines().count();

        // Build a lookup map from name to (node, kind) for dependency resolution
        let symbol_map: std::collections::HashMap<String, (Node, String)> = all_symbols
            .iter()
            .map(|(node, kind, name)| (name.clone(), (*node, kind.clone())))
            .collect();

        // Find the target node before consuming all_symbols
        let target_node_for_deps = if let Some(target_name) = symbol_name {
            all_symbols
                .iter()
                .find(|(_, _, n)| n == target_name)
                .map(|(n, _, _)| *n)
        } else {
            all_symbols.first().map(|(n, _, _)| *n)
        };

        let symbols = if let Some(target_name) = symbol_name {
            // Find specific symbol
            if let Some((node, kind, name)) = all_symbols.iter().find(|(_, _, n)| n == target_name) {
                vec![Self::build_symbol_with_body(*node, source, kind.clone(), name.clone())]
            } else {
                return Err(anyhow::anyhow!(
                    "Symbol '{}' not found in {}",
                    target_name,
                    path.display()
                ));
            }
        } else {
            // Extract all symbols with bodies
            all_symbols
                .into_iter()
                .map(|(node, kind, name)| Self::build_symbol_with_body(node, source, kind, name))
                .collect()
        };

        let dependencies = if with_deps && !symbols.is_empty() {
            // Collect references from the target symbol's body
            let target_sym = &symbols[0];

            if let Some(node) = target_node_for_deps {
                let refs = Self::collect_references(node, source, &target_sym.name);
                let mut deps = Vec::new();
                let mut seen = HashSet::new();

                for ref_name in refs {
                    if seen.contains(&ref_name) {
                        continue;
                    }
                    seen.insert(ref_name.clone());

                    if let Some((dep_node, dep_kind)) = symbol_map.get(&ref_name) {
                        // Same-file dependency — pull its prototype
                        let dep_signature = extract_signature(*dep_node, source);
                        let dep_doc = extract_doc_comment(*dep_node, source);
                        let dep_line_start = dep_node.start_position().row + 1;
                        let dep_line_end = dep_node.end_position().row + 1;

                        deps.push(Dependency {
                            name: ref_name.clone(),
                            kind: "type_ref".to_string(),
                            source: Some("same_file".to_string()),
                            prototype: Some(Symbol {
                                kind: dep_kind.clone(),
                                name: ref_name,
                                signature: dep_signature,
                                doc_comment: dep_doc,
                                line_start: dep_line_start,
                                line_end: dep_line_end,
                                body: None,
                            }),
                        });
                    } else {
                        // External reference
                        deps.push(Dependency {
                            name: ref_name,
                            kind: "type_ref".to_string(),
                            source: None,
                            prototype: None,
                        });
                    }
                }

                deps
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        Ok(CodeResult {
            path: path.to_string_lossy().to_string(),
            language: provider.name.to_string(),
            mode: "deep".to_string(),
            total_lines,
            symbols,
            dependencies,
            parse_error: None,
        })
    }
}
