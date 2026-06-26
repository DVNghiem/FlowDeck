use crate::reader::diff::{DiffFileResult, FileStatus};
use crate::reader::outline::OutlineFileResult;
use serde::Serialize;
use std::io::{self, Write};

// ---------------------------------------------------------------------------
// Outline JSON
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct OutlineJsonOutput {
    total_files: usize,
    total_symbols: usize,
    total_lines: usize,
    files: Vec<OutlineFileJson>,
}

#[derive(Serialize)]
struct OutlineFileJson {
    path: String,
    language: String,
    total_lines: usize,
    symbols: Vec<OutlineSymbolJson>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parse_error: Option<String>,
}

#[derive(Serialize)]
struct OutlineSymbolJson {
    kind: String,
    name: String,
    signature: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    doc_comment: Option<String>,
    line_start: usize,
    line_end: usize,
}

/// Print outline results in JSON format.
pub fn print_json_outline_results(
    writer: &mut dyn Write,
    results: &[OutlineFileResult],
) -> io::Result<()> {
    let total_symbols: usize = results.iter().map(|r| r.symbols.len()).sum();
    let total_lines: usize = results.iter().map(|r| r.total_lines).sum();

    let output = OutlineJsonOutput {
        total_files: results.len(),
        total_symbols,
        total_lines,
        files: results
            .iter()
            .map(|r| OutlineFileJson {
                path: r.path.clone(),
                language: r.language.clone(),
                total_lines: r.total_lines,
                symbols: r
                    .symbols
                    .iter()
                    .map(|s| OutlineSymbolJson {
                        kind: s.kind.clone(),
                        name: s.name.clone(),
                        signature: s.signature.clone(),
                        doc_comment: s.doc_comment.clone(),
                        line_start: s.line_start,
                        line_end: s.line_end,
                    })
                    .collect(),
                parse_error: r.parse_error.clone(),
            })
            .collect(),
    };

    let json = serde_json::to_string_pretty(&output).map_err(|e| {
        io::Error::other(format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Diff JSON
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct DiffJsonOutput {
    base: String,
    staged: bool,
    summary: DiffSummaryJson,
    files: Vec<DiffFileJson>,
}

#[derive(Serialize)]
struct DiffSummaryJson {
    files_changed: usize,
    symbols_modified: usize,
    files_added: usize,
    files_deleted: usize,
}

#[derive(Serialize)]
struct DiffFileJson {
    path: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    symbol_changes: Vec<DiffSymbolChangeJson>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    file_level_changes: Vec<DiffFileLevelJson>,
    lines_added: usize,
    lines_removed: usize,
}

#[derive(Serialize)]
struct DiffSymbolChangeJson {
    kind: String,
    name: String,
    change_type: String,
    line_start: usize,
    line_end: usize,
    lines_added: usize,
    lines_removed: usize,
}

#[derive(Serialize)]
struct DiffFileLevelJson {
    change_type: String,
    lines_added: usize,
    lines_removed: usize,
    raw_lines: Vec<String>,
}

/// Print diff results in JSON format.
pub fn print_json_diff_results(
    writer: &mut dyn Write,
    results: &[DiffFileResult],
    base: &str,
    staged: bool,
) -> io::Result<()> {
    let mut files_changed = 0usize;
    let mut symbols_modified = 0usize;
    let mut files_added = 0usize;
    let mut files_deleted = 0usize;

    let file_jsons: Vec<DiffFileJson> = results
        .iter()
        .map(|r| {
            match r.status {
                FileStatus::Modified => files_changed += 1,
                FileStatus::Added => files_added += 1,
                FileStatus::Deleted => files_deleted += 1,
            }

            let symbol_changes: Vec<DiffSymbolChangeJson> = r
                .symbol_changes
                .iter()
                .map(|sc| {
                    symbols_modified += 1;
                    DiffSymbolChangeJson {
                        kind: sc.kind.clone(),
                        name: sc.name.clone(),
                        change_type: sc.change_type.to_string(),
                        line_start: sc.line_start,
                        line_end: sc.line_end,
                        lines_added: sc.lines_added,
                        lines_removed: sc.lines_removed,
                    }
                })
                .collect();

            let file_level_changes: Vec<DiffFileLevelJson> = r
                .file_level_changes
                .iter()
                .map(|flc| DiffFileLevelJson {
                    change_type: "file_level".to_string(),
                    lines_added: flc.lines_added,
                    lines_removed: flc.lines_removed,
                    raw_lines: flc.raw_lines.clone(),
                })
                .collect();

            DiffFileJson {
                path: r.path.clone(),
                status: r.status.to_string(),
                language: r.language.clone(),
                symbol_changes,
                file_level_changes,
                lines_added: r.lines_added,
                lines_removed: r.lines_removed,
            }
        })
        .collect();

    let output = DiffJsonOutput {
        base: base.to_string(),
        staged,
        summary: DiffSummaryJson {
            files_changed,
            symbols_modified,
            files_added,
            files_deleted,
        },
        files: file_jsons,
    };

    let json = serde_json::to_string_pretty(&output).map_err(|e| {
        io::Error::other(format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}
