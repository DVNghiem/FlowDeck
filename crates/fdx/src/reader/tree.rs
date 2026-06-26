use anyhow::Result;
use ignore::WalkBuilder;
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;

/// Options for the `tree` command.
#[derive(Debug, Clone)]
pub struct TreeOptions {
    /// Max depth (default: 3).
    pub depth: usize,
    /// Show directories only.
    pub dirs_only: bool,
}

/// A node in the directory tree.
#[derive(Debug, Clone)]
pub struct TreeNode {
    /// Node name.
    pub name: String,
    /// Whether this is a directory.
    pub is_dir: bool,
    /// Child nodes (empty for files).
    pub children: Vec<TreeNode>,
    /// Number of files in this directory subtree.
    pub file_count: Option<usize>,
}

/// Result of generating a tree.
#[derive(Debug, Clone)]
pub struct TreeResult {
    /// Root path.
    pub root: String,
    /// Root node.
    pub root_node: TreeNode,
    /// Whether the tree was truncated.
    pub truncated: bool,
}

/// Directories to always skip.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".next",
    "coverage",
];

/// Hard cap on total nodes.
const MAX_NODES: usize = 200;

/// Generate a directory tree at the given path.
///
/// Uses `ignore::WalkBuilder` for gitignore-aware traversal.
/// Skips common build/dependency directories.
/// Hard cap: 200 nodes total. If exceeded, subtrees are collapsed.
pub fn tree_paths(path: &Path, options: &TreeOptions) -> Result<TreeResult> {
    let root_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".to_string());

    let walker = WalkBuilder::new(path)
        .hidden(false)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(true)
        .max_depth(Some(options.depth + 1))
        .build();

    let mut entries: Vec<(ignore::DirEntry, usize)> = Vec::new();
    let skip_set: HashSet<&str> = SKIP_DIRS.iter().copied().collect();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        let depth = entry.depth();
        if depth == 0 {
            continue; // skip root
        }

        let name = entry.file_name().to_string_lossy().into_owned();

        // Skip known directories
        if skip_set.contains(name.as_str()) {
            continue;
        }

        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

        if options.dirs_only && !is_dir {
            continue;
        }

        entries.push((entry, depth));
    }

    // Check hard cap
    let truncated = entries.len() > MAX_NODES;
    if entries.len() > MAX_NODES {
        entries.truncate(MAX_NODES);
    }

    // Build tree structure
    let root_node = build_tree(&root_name, path, &entries, options.dirs_only);

    Ok(TreeResult {
        root: path.to_string_lossy().to_string(),
        root_node,
        truncated,
    })
}

/// Build tree using a HashMap from parent paths to child entries.
fn build_tree(
    root_name: &str,
    root_path: &Path,
    entries: &[(ignore::DirEntry, usize)],
    dirs_only: bool,
) -> TreeNode {
    // Map from parent path string to list of (name, is_dir) children
    let mut children_map: HashMap<String, Vec<(String, bool)>> = HashMap::new();

    for (entry, _depth) in entries {
        let path = entry.path();
        let parent = path
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| root_path.to_string_lossy().into_owned());

        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

        children_map
            .entry(parent)
            .or_default()
            .push((name, is_dir));
    }

    // Sort children within each parent: dirs first, then alphabetically
    for children in children_map.values_mut() {
        children.sort_by(|a, b| match (a.1, b.1) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.0.cmp(&b.0),
        });
    }

    // Recursively build nodes
    let root_path_str = root_path.to_string_lossy().into_owned();
    build_node_recursive(root_name, true, &root_path_str, &children_map, dirs_only)
}

fn build_node_recursive(
    name: &str,
    is_dir: bool,
    full_path: &str,
    children_map: &HashMap<String, Vec<(String, bool)>>,
    dirs_only: bool,
) -> TreeNode {
    let mut children = Vec::new();

    if let Some(child_entries) = children_map.get(full_path) {
        for (child_name, child_is_dir) in child_entries {
            if dirs_only && !child_is_dir {
                continue;
            }

            let child_path = format!("{}/{}", full_path, child_name);
            let child_node = build_node_recursive(
                child_name,
                *child_is_dir,
                &child_path,
                children_map,
                dirs_only,
            );
            children.push(child_node);
        }
    }

    let file_count = if is_dir {
        Some(count_files_in_subtree(&children,
            full_path,
            children_map,
        ))
    } else {
        None
    };

    TreeNode {
        name: name.to_string(),
        is_dir,
        children,
        file_count,
    }
}

fn count_files_in_subtree(
    children: &[TreeNode],
    _full_path: &str,
    _children_map: &HashMap<String, Vec<(String, bool)>>,
) -> usize {
    let mut count = 0;
    for child in children {
        if child.is_dir {
            if let Some(fc) = child.file_count {
                count += fc;
            }
        } else {
            count += 1;
        }
    }
    count
}
