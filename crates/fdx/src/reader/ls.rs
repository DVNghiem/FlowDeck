use crate::runner::{run, CommandOutput};
use anyhow::{Context, Result};
use std::path::Path;

/// Options for the `ls` command.
#[derive(Debug, Clone)]
pub struct LsOptions {
    /// Include hidden files (default: false).
    pub all: bool,
    /// Output format.
    pub format: crate::output::OutputFormat,
}

/// A single directory entry.
#[derive(Debug, Clone)]
pub struct LsEntry {
    /// Entry name.
    pub name: String,
    /// Whether this is a directory.
    pub is_dir: bool,
    /// Size in bytes (0 for directories).
    pub size_bytes: u64,
    /// Last modified timestamp (seconds since epoch).
    pub modified: u64,
}

/// Result of listing a directory.
#[derive(Debug, Clone)]
pub struct LsResult {
    /// The path that was listed.
    pub path: String,
    /// Directory entries.
    pub entries: Vec<LsEntry>,
    /// Whether the list was truncated.
    pub truncated: bool,
    /// Number of hidden entries not shown (when truncated).
    pub hidden_count: usize,
}

/// List directory entries at the given path.
///
/// On Unix, shells out to `ls -la`. On Windows, uses `dir`.
/// Filters out `.` and `..`, groups directories first, sorts alphabetically.
/// Hard cap: 50 entries. Hidden files are excluded unless `all` is true.
pub fn ls_paths(path: &Path, options: &LsOptions) -> Result<LsResult> {
    let path_str = path.to_string_lossy();

    // Prefer std::fs::read_dir for cross-platform consistency
    let mut entries = Vec::new();
    let mut hidden_count = 0;

    for entry in std::fs::read_dir(path)
        .with_context(|| format!("cannot access '{}': No such file or directory", path_str))? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();

        // Skip . and ..
        if name == "." || name == ".." {
            continue;
        }

        // Skip hidden files unless --all
        if !options.all && name.starts_with('.') {
            hidden_count += 1;
            continue;
        }

        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size_bytes = metadata.as_ref().map(|m| if m.is_dir() { 0 } else { m.len() }).unwrap_or(0);
        let modified = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        entries.push(LsEntry {
            name,
            is_dir,
            size_bytes,
            modified,
        });
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    // Hard cap: 50 entries
    let truncated = entries.len() > 50;
    if entries.len() > 50 {
        entries.truncate(50);
    }

    Ok(LsResult {
        path: path_str.to_string(),
        entries,
        truncated,
        hidden_count,
    })
}

/// Fallback: parse `ls -la` output on Unix systems.
///
/// Used when `std::fs::read_dir` is insufficient or for testing.
pub fn ls_via_command(path: &Path, _options: &LsOptions) -> Result<CommandOutput> {
    let path_str = path.to_string_lossy();
    run("ls", &["-la", &path_str])
}
