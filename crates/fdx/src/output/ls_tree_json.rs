use crate::reader::ls::LsResult;
use serde::Serialize;
use std::io::{self, Write};

/// Print tree results as JSON.
pub fn print_json_tree_results(
    writer: &mut dyn Write,
    result: &crate::reader::tree::TreeResult,
) -> io::Result<()> {
    let root = tree_node_to_json(&result.root_node);
    let output = TreeJsonOutput {
        root: result.root.clone(),
        tree: root,
        truncated: result.truncated,
    };

    let json = serde_json::to_string_pretty(&output)
        .map_err(|e| io::Error::other(format!("JSON serialization error: {}", e)))?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

#[derive(Serialize)]
struct TreeJsonOutput {
    root: String,
    tree: TreeNodeJson,
    truncated: bool,
}

#[derive(Serialize)]
struct TreeNodeJson {
    name: String,
    #[serde(rename = "type")]
    node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_count: Option<usize>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    children: Vec<TreeNodeJson>,
}

fn tree_node_to_json(node: &crate::reader::tree::TreeNode) -> TreeNodeJson {
    TreeNodeJson {
        name: node.name.clone(),
        node_type: if node.is_dir { "dir".to_string() } else { "file".to_string() },
        file_count: node.file_count,
        children: node.children.iter().map(tree_node_to_json).collect(),
    }
}

#[derive(Serialize)]
struct LsJsonOutput<'a> {
    path: &'a str,
    dirs: Vec<&'a str>,
    files: Vec<LsFileJson>,
    truncated: bool,
}

#[derive(Serialize)]
struct LsFileJson {
    name: String,
    size_bytes: u64,
    modified: u64,
}

/// Print ls results as JSON.
pub fn print_json_ls_results(writer: &mut dyn Write, result: &LsResult) -> io::Result<()> {
    let dirs: Vec<&str> = result
        .entries
        .iter()
        .filter(|e| e.is_dir)
        .map(|e| e.name.as_str())
        .collect();

    let files: Vec<LsFileJson> = result
        .entries
        .iter()
        .filter(|e| !e.is_dir)
        .map(|e| LsFileJson {
            name: e.name.clone(),
            size_bytes: e.size_bytes,
            modified: e.modified,
        })
        .collect();

    let output = LsJsonOutput {
        path: &result.path,
        dirs,
        files,
        truncated: result.truncated,
    };

    let json = serde_json::to_string_pretty(&output)
        .map_err(|e| io::Error::other(format!("JSON serialization error: {}", e)))?;
    writeln!(writer, "{}", json)?;
    Ok(())
}
