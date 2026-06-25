use crate::reader::batch::BatchItem;
use crate::reader::code::CodeResult;
use crate::reader::grep::GrepFileResult;
use crate::reader::impact::ImpactResult;
use crate::reader::search::SearchMatch;
use crate::reader::text::TextResult;
use serde::Serialize;
use serde_json;
use std::io::{self, Write};

pub fn print_json_output(writer: &mut dyn Write, result: &CodeResult) -> io::Result<()> {
    let json = serde_json::to_string_pretty(result).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

pub fn print_json_text_result(writer: &mut dyn Write, result: &TextResult) -> io::Result<()> {
    let json = serde_json::to_string_pretty(result).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

/// JSON wrapper for search results.
#[derive(Serialize)]
struct SearchJsonOutput<'a> {
    pattern: &'a str,
    total_matches: usize,
    matches: Vec<SearchMatchJson<'a>>,
}

#[derive(Serialize)]
struct SearchMatchJson<'a> {
    file: &'a str,
    symbol: &'a crate::reader::code::Symbol,
}

pub fn print_json_search_results(
    writer: &mut dyn Write,
    matches: &[SearchMatch],
    pattern: &str,
) -> io::Result<()> {
    let output = SearchJsonOutput {
        pattern,
        total_matches: matches.len(),
        matches: matches
            .iter()
            .map(|m| SearchMatchJson {
                file: &m.path,
                symbol: &m.symbol,
            })
            .collect(),
    };

    let json = serde_json::to_string_pretty(&output).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

/// JSON wrapper for grep results.
#[derive(Serialize)]
struct GrepJsonOutput<'a> {
    total_matches: usize,
    truncated: bool,
    files: Vec<GrepFileJson<'a>>,
}

#[derive(Serialize)]
struct GrepFileJson<'a> {
    path: &'a str,
    matches: Vec<GrepMatchJson>,
}

#[derive(Serialize)]
struct GrepMatchJson {
    line_number: usize,
    text: String,
    context_before: Vec<String>,
    context_after: Vec<String>,
}

pub fn print_json_grep_results(
    writer: &mut dyn Write,
    files: &[GrepFileResult],
    total_matches: usize,
    truncated: bool,
) -> io::Result<()> {
    let output = GrepJsonOutput {
        total_matches,
        truncated,
        files: files
            .iter()
            .map(|f| GrepFileJson {
                path: &f.path,
                matches: f
                    .matches
                    .iter()
                    .map(|m| GrepMatchJson {
                        line_number: m.line_number,
                        text: m.text.clone(),
                        context_before: m.context_before.clone(),
                        context_after: m.context_after.clone(),
                    })
                    .collect(),
            })
            .collect(),
    };

    let json = serde_json::to_string_pretty(&output).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

/// JSON wrapper for batch results.
#[derive(Serialize)]
struct BatchJsonOutput<'a> {
    files: Vec<BatchItemJson<'a>>,
    total_files: usize,
    truncated: bool,
}

#[derive(Serialize)]
#[serde(untagged)]
enum BatchItemJson<'a> {
    Code { code: &'a CodeResult },
    Text { text: &'a TextResult },
    Error { path: &'a str, error: &'a str },
}

pub fn print_json_batch_results(
    writer: &mut dyn Write,
    items: &[BatchItem],
    truncated: bool,
) -> io::Result<()> {
    let output = BatchJsonOutput {
        total_files: items.len(),
        truncated,
        files: items
            .iter()
            .map(|item| match item {
                BatchItem::Ok(code) => BatchItemJson::Code { code },
                BatchItem::Text(text) => BatchItemJson::Text { text },
                BatchItem::ParseError { path, error } => BatchItemJson::Error { path, error },
            })
            .collect(),
    };

    let json = serde_json::to_string_pretty(&output).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

/// JSON wrapper for impact results.
#[derive(Serialize)]
struct ImpactJsonOutput<'a> {
    target: &'a str,
    depth: usize,
    outbound: Vec<ImpactDepJson<'a>>,
    inbound: Vec<ImpactDepJson<'a>>,
}

#[derive(Serialize)]
struct ImpactDepJson<'a> {
    path: Option<&'a str>,
    resolved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    symbols_used: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    at_lines: Option<&'a [usize]>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    prototypes: Vec<&'a crate::reader::code::Symbol>,
}

pub fn print_json_impact_results(
    writer: &mut dyn Write,
    results: &[ImpactResult],
) -> io::Result<()> {
    let mut outputs = Vec::new();

    for result in results {
        outputs.push(ImpactJsonOutput {
            target: &result.target,
            depth: result.depth,
            outbound: result
                .outbound
                .iter()
                .map(|d| ImpactDepJson {
                    path: d.path.as_deref(),
                    resolved: d.resolved,
                    symbols_used: if d.symbols_used.is_empty() {
                        None
                    } else {
                        Some(&d.symbols_used)
                    },
                    at_lines: if d.at_lines.is_empty() {
                        None
                    } else {
                        Some(&d.at_lines)
                    },
                    prototypes: d.prototypes.iter().collect(),
                })
                .collect(),
            inbound: result
                .inbound
                .iter()
                .map(|d| ImpactDepJson {
                    path: d.path.as_deref(),
                    resolved: d.resolved,
                    symbols_used: if d.symbols_used.is_empty() {
                        None
                    } else {
                        Some(&d.symbols_used)
                    },
                    at_lines: if d.at_lines.is_empty() {
                        None
                    } else {
                        Some(&d.at_lines)
                    },
                    prototypes: Vec::new(),
                })
                .collect(),
        });
    }

    let json = serde_json::to_string_pretty(&outputs).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}
