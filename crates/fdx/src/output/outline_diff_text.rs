use crate::reader::outline::OutlineFileResult;
use crate::reader::diff::{DiffFileResult, FileStatus, ChangeType};
use std::io::{self, Write};

/// Print outline results in text format.
pub fn print_outline_results(
    writer: &mut dyn Write,
    results: &[OutlineFileResult],
) -> io::Result<()> {
    if results.is_empty() {
        writeln!(writer, "No code files found.")?;
        return Ok(());
    }

    let mut total_symbols = 0usize;
    let mut total_lines = 0usize;

    // Group by directory
    let mut current_dir: Option<String> = None;

    for result in results {
        let path = &result.path;
        let dir = std::path::Path::new(path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string());

        if current_dir.as_ref() != Some(&dir) {
            writeln!(writer, "{}/", dir)?;
            current_dir = Some(dir);
        }

        let file_name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());

        if let Some(ref err) = result.parse_error {
            writeln!(
                writer,
                "  {}  ({}, {} lines) [parse error — skipped] {}",
                file_name, result.language, result.total_lines, err
            )?;
            continue;
        }

        writeln!(
            writer,
            "  {}  ({}, {} lines, {} symbols)",
            file_name,
            result.language,
            result.total_lines,
            result.symbols.len()
        )?;

        for sym in &result.symbols {
            let kind_label = match sym.kind.as_str() {
                "function" => "fn",
                "method" => "method",
                "class" => "class",
                "struct" => "struct",
                "interface" => "interface",
                "enum" => "enum",
                "trait" => "trait",
                "type" => "type",
                _ => &sym.kind,
            };
            writeln!(
                writer,
                "    [{}]     {}   L{}",
                kind_label, sym.signature, sym.line_start
            )?;
            if let Some(doc) = &sym.doc_comment {
                for line in doc.lines() {
                    writeln!(writer, "               // {}", line)?;
                }
            }
        }

        total_symbols += result.symbols.len();
        total_lines += result.total_lines;
    }

    writeln!(writer)?;
    writeln!(
        writer,
        "{} file{}  |  {} symbol{}  |  {} total lines",
        results.len(),
        if results.len() == 1 { "" } else { "s" },
        total_symbols,
        if total_symbols == 1 { "" } else { "s" },
        total_lines
    )?;

    Ok(())
}

/// Print diff results in text format.
pub fn print_diff_results(
    writer: &mut dyn Write,
    results: &[DiffFileResult],
    _base: &str,
    _staged: bool,
) -> io::Result<()> {
    if results.is_empty() {
        writeln!(writer, "No changes found.")?;
        return Ok(());
    }

    let mut files_changed = 0usize;
    let mut symbols_modified = 0usize;
    let mut files_added = 0usize;
    let mut files_deleted = 0usize;

    for result in results {
        match result.status {
            FileStatus::Modified => files_changed += 1,
            FileStatus::Added => files_added += 1,
            FileStatus::Deleted => files_deleted += 1,
        }

        let status_label = match result.status {
            FileStatus::Modified => "changed",
            FileStatus::Added => "added",
            FileStatus::Deleted => "deleted",
        };

        let lang_str = result
            .language
            .as_ref()
            .map(|l| format!("  ({})", l))
            .unwrap_or_default();

        writeln!(writer, "[{}] {}{}", status_label, result.path, lang_str)?;
        writeln!(writer)?;

        if result.status == FileStatus::Deleted {
            writeln!(
                writer,
                "  (file removed — {} lines)",
                result.lines_removed
            )?;
            writeln!(writer)?;
            continue;
        }

        for sc in &result.symbol_changes {
            symbols_modified += 1;
            let kind_label = match sc.kind.as_str() {
                "function" => "fn",
                "method" => "method",
                "class" => "class",
                "struct" => "struct",
                "interface" => "interface",
                "enum" => "enum",
                "trait" => "trait",
                "type" => "type",
                _ => &sc.kind,
            };
            writeln!(
                writer,
                "  [{}] {}  — {}  L{}-{}",
                kind_label, sc.name, sc.change_type, sc.line_start, sc.line_end
            )?;
            if sc.lines_added > 0 || sc.lines_removed > 0 {
                writeln!(
                    writer,
                    "    // {} line{} added, {} line{} removed inside {}",
                    sc.lines_added,
                    if sc.lines_added == 1 { "" } else { "s" },
                    sc.lines_removed,
                    if sc.lines_removed == 1 { "" } else { "s" },
                    if sc.change_type == ChangeType::SignatureChanged {
                        "signature"
                    } else {
                        "body"
                    }
                )?;
            }
        }

        for flc in &result.file_level_changes {
            writeln!(
                writer,
                "  [file_level]  L{}-{}",
                flc.line_start, flc.line_end
            )?;
            if !flc.raw_lines.is_empty() {
                for line in &flc.raw_lines {
                    writeln!(writer, "    {}", line)?;
                }
            }
        }

        writeln!(writer)?;
    }

    writeln!(
        writer,
        "{} file{} changed  |  {} symbol{} modified  |  {} file{} added  |  {} file{} deleted",
        files_changed,
        if files_changed == 1 { "" } else { "s" },
        symbols_modified,
        if symbols_modified == 1 { "" } else { "s" },
        files_added,
        if files_added == 1 { "" } else { "s" },
        files_deleted,
        if files_deleted == 1 { "" } else { "s" }
    )?;

    Ok(())
}
