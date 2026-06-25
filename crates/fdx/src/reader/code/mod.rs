use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub kind: String,
    pub name: String,
    pub signature: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_comment: Option<String>,
    pub line_start: usize,
    pub line_end: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub name: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prototype: Option<Symbol>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeResult {
    pub path: String,
    pub language: String,
    pub mode: String,
    pub total_lines: usize,
    pub symbols: Vec<Symbol>,
    pub dependencies: Vec<Dependency>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextResult {
    pub path: String,
    pub language: String,
    pub mode: String,
    pub total_lines: usize,
    pub offset: usize,
    pub returned_lines: usize,
    pub lines: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
}

pub mod cache;
pub mod deep;
pub mod languages;
pub mod parser;
pub mod prototype;

pub use prototype::{
    extract_doc_comment, extract_signature, extract_symbol_name, find_child_by_kind,
    find_symbols_in_tree, map_kind, node_text,
};

pub trait CodeReader {
    fn read_prototypes(
        &self,
        path: &Path,
        source: &str,
        tree: &tree_sitter::Tree,
    ) -> anyhow::Result<Vec<Symbol>>;

    fn read_deep(
        &self,
        path: &Path,
        source: &str,
        tree: &tree_sitter::Tree,
        symbol_name: Option<&str>,
        with_deps: bool,
    ) -> anyhow::Result<CodeResult>;
}
