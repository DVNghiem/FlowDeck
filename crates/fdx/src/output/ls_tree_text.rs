use crate::reader::ls::{LsEntry, LsResult};
use std::io::{self, Write};

/// Print ls results in compact text format.
///
/// Example:
/// ```text
/// ./  (14 entries)
///   dirs/   config/   src/   tests/
///   files   Cargo.toml (2.1KB)   README.md (8.4KB)
/// ```
pub fn print_ls_results(writer: &mut dyn Write, result: &LsResult) -> io::Result<()> {
    let total = result.entries.len() + result.hidden_count;
    writeln!(writer, "{}/  ({} entries)", result.path, total)?;

    let dirs: Vec<&LsEntry> = result.entries.iter().filter(|e| e.is_dir).collect();
    let files: Vec<&LsEntry> = result.entries.iter().filter(|e| !e.is_dir).collect();

    if !dirs.is_empty() {
        write!(writer, "  dirs/  ")?;
        for (i, d) in dirs.iter().enumerate() {
            if i > 0 {
                write!(writer, "   ")?;
            }
            write!(writer, "{}/", d.name)?;
        }
        writeln!(writer)?;
    }

    if !files.is_empty() {
        write!(writer, "  files  ")?;
        for (i, f) in files.iter().enumerate() {
            if i > 0 {
                write!(writer, "   ")?;
            }
            let size = human_size(f.size_bytes);
            write!(writer, "{} ({})", f.name, size)?;
        }
        writeln!(writer)?;
    }

    if result.truncated {
        writeln!(writer, "  [{} hidden entries — use --all to show]", result.hidden_count)?;
    }

    Ok(())
}

/// Convert bytes to human-readable size.
fn human_size(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1}GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1}MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else {
        format!("{}B", bytes)
    }
}

pub fn print_tree_results(writer: &mut dyn Write, result: &crate::reader::tree::TreeResult) -> io::Result<()> {
    print_tree_node(writer, &result.root_node, "", true)?;
    if result.truncated {
        writeln!(writer, "[truncated — tree exceeds 200 nodes]")?;
    }
    Ok(())
}

fn print_tree_node(
    writer: &mut dyn Write,
    node: &crate::reader::tree::TreeNode,
    prefix: &str,
    is_last: bool,
) -> io::Result<()> {
    let branch = if prefix.is_empty() {
        ""
    } else if is_last {
        "└── "
    } else {
        "├── "
    };

    let name = if node.is_dir {
        if let Some(count) = node.file_count {
            format!("{} ({} files)", node.name, count)
        } else {
            format!("{}/", node.name)
        }
    } else {
        node.name.clone()
    };

    writeln!(writer, "{}{}{}", prefix, branch, name)?;

    let child_prefix = if prefix.is_empty() {
        ""
    } else if is_last {
        &format!("{}    ", prefix)
    } else {
        &format!("{}│   ", prefix)
    };

    let child_count = node.children.len();
    for (i, child) in node.children.iter().enumerate() {
        let child_is_last = i == child_count - 1;
        print_tree_node(writer, child, child_prefix, child_is_last)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_human_size() {
        assert_eq!(human_size(0), "0B");
        assert_eq!(human_size(512), "512B");
        assert_eq!(human_size(1024), "1.0KB");
        assert_eq!(human_size(1536), "1.5KB");
        assert_eq!(human_size(1_048_576), "1.0MB");
        assert_eq!(human_size(1_073_741_824), "1.0GB");
    }
}
