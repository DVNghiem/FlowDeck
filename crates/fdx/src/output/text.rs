use crate::reader::code::{Dependency, Symbol};
use crate::reader::grep::GrepFileResult;
use crate::reader::impact::ImpactResult;
use crate::reader::search::SearchMatch;
use crate::reader::text::TextResult;
use std::io::{self, Write};

pub fn print_text_output(
    writer: &mut dyn Write,
    path: &str,
    language: &str,
    mode: &str,
    total_lines: usize,
    symbols: &[Symbol],
    parse_error: Option<&str>,
) -> io::Result<()> {
    writeln!(
        writer,
        "[file] {}  ({}, {} lines, {} mode)",
        path, language, total_lines, mode
    )?;
    writeln!(writer)?;

    if let Some(err) = parse_error {
        writeln!(writer, "[parse error — raw fallback] {}", err)?;
        writeln!(writer)?;
    }

    for sym in symbols {
        let kind_label = match sym.kind.as_str() {
            "function" => "fn",
            "method" => "method",
            "class" => "class",
            "struct" => "struct",
            "interface" => "interface",
            "enum" => "enum",
            "trait" => "trait",
            _ => "symbol",
        };
        writeln!(
            writer,
            "[{}] {}   L{}-{}",
            kind_label, sym.signature, sym.line_start, sym.line_end
        )?;
        if let Some(doc) = &sym.doc_comment {
            for line in doc.lines() {
                writeln!(writer, "  // {}", line)?;
            }
        }

        // Print body in deep mode
        if let Some(body) = &sym.body {
            writeln!(writer, "  --- body ---")?;
            for line in body.lines() {
                writeln!(writer, "  {}", line)?;
            }
            writeln!(writer, "  --- end body ---")?;
        }

        writeln!(writer)?;
    }

    Ok(())
}

pub fn print_text_result(
    writer: &mut dyn Write,
    path: &str,
    result: &TextResult,
) -> io::Result<()> {
    writeln!(
        writer,
        "[file] {}  (text, {} lines total, offset {}, returned {} lines)",
        path, result.total_lines, result.offset, result.returned_lines
    )?;
    writeln!(writer)?;
    for line in &result.lines {
        writeln!(writer, "{}", line)?;
    }
    Ok(())
}

/// Print dependencies section in text format.
pub fn print_dependencies(writer: &mut dyn Write, deps: &[Dependency]) -> io::Result<()> {
    if deps.is_empty() {
        return Ok(());
    }

    writeln!(writer, "[dependencies]")?;
    for dep in deps {
        if let Some(source) = &dep.source {
            writeln!(
                writer,
                "  {} ({}, from: {})",
                dep.name, dep.kind, source
            )?;
        } else {
            writeln!(writer, "  {} ({}, external)", dep.name, dep.kind)?;
        }

        if let Some(proto) = &dep.prototype {
            writeln!(
                writer,
                "    prototype: [{}] {}   L{}-{}",
                proto.kind, proto.signature, proto.line_start, proto.line_end
            )?;
            if let Some(doc) = &proto.doc_comment {
                for line in doc.lines() {
                    writeln!(writer, "      // {}", line)?;
                }
            }
        }
    }
    writeln!(writer)?;

    Ok(())
}

/// Print search results in text format.
pub fn print_search_results(
    writer: &mut dyn Write,
    matches: &[SearchMatch],
    pattern: &str,
) -> io::Result<()> {
    if matches.is_empty() {
        writeln!(writer, "No matches found for '{}'", pattern)?;
        return Ok(());
    }

    for m in matches {
        writeln!(writer, "[match] {}", m.path)?;
        let kind_label = match m.symbol.kind.as_str() {
            "function" => "fn",
            "method" => "method",
            "class" => "class",
            "struct" => "struct",
            "interface" => "interface",
            "enum" => "enum",
            "trait" => "trait",
            _ => "symbol",
        };
        writeln!(
            writer,
            "[{}] {}   L{}-{}",
            kind_label, m.symbol.signature, m.symbol.line_start, m.symbol.line_end
        )?;
        if let Some(doc) = &m.symbol.doc_comment {
            for line in doc.lines() {
                writeln!(writer, "  // {}", line)?;
            }
        }
        writeln!(writer)?;
    }

    Ok(())
}

/// Print grep results in text format.
pub fn print_grep_results(
    writer: &mut dyn Write,
    files: &[GrepFileResult],
    total_matches: usize,
    truncated: bool,
) -> io::Result<()> {
    if files.is_empty() {
        writeln!(writer, "No matches found")?;
        return Ok(());
    }

    for file in files {
        let file_matches: usize = file.matches.len();
        writeln!(writer, "[file] {}  ({} matches)", file.path, file_matches)?;

        for (i, m) in file.matches.iter().enumerate() {
            for (j, ctx) in m.context_before.iter().enumerate() {
                writeln!(
                    writer,
                    "  L{}: {}",
                    m.line_number - m.context_before.len() + j,
                    ctx
                )?;
            }
            writeln!(writer, "  L{}: {}", m.line_number, m.text)?;
            for (j, ctx) in m.context_after.iter().enumerate() {
                writeln!(writer, "  L{}: {}", m.line_number + 1 + j, ctx)?;
            }

            if i < file.matches.len() - 1 {
                writeln!(writer, "  ---")?;
            }
        }
        writeln!(writer)?;
    }

    let file_count = files.len();
    writeln!(
        writer,
        "{} match{} across {} file{}",
        total_matches,
        if total_matches == 1 { "" } else { "es" },
        file_count,
        if file_count == 1 { "" } else { "s" }
    )?;

    if truncated {
        writeln!(writer, "[truncated — more matches not shown]")?;
    }

    Ok(())
}

/// Print batch results in text format.
pub fn print_batch_results(
    writer: &mut dyn Write,
    items: &[crate::reader::batch::BatchItem],
    truncated: bool,
) -> io::Result<()> {
    for item in items {
        match item {
            crate::reader::batch::BatchItem::Ok(code_result) => {
                writeln!(writer, "--- {} ---", code_result.path)?;
                print_text_output(
                    writer,
                    &code_result.path,
                    &code_result.language,
                    &code_result.mode,
                    code_result.total_lines,
                    &code_result.symbols,
                    code_result.parse_error.as_deref(),
                )?;
            }
            crate::reader::batch::BatchItem::Text(text_result) => {
                writeln!(writer, "--- {} ---", text_result.path)?;
                print_text_result(writer, &text_result.path, text_result)?;
            }
            crate::reader::batch::BatchItem::ParseError { path, error } => {
                writeln!(writer, "--- {} ---", path)?;
                writeln!(writer, "[parse error — skipped] {}", error)?;
            }
        }
        writeln!(writer)?;
    }

    if truncated {
        writeln!(writer, "[truncated — more files not shown]")?;
    }

    Ok(())
}

/// Print impact results in text format.
pub fn print_impact_results(
    writer: &mut dyn Write,
    results: &[ImpactResult],
) -> io::Result<()> {
    for result in results {
        writeln!(writer, "[impact] {}", result.target)?;
        writeln!(writer)?;

        if !result.outbound.is_empty() {
            writeln!(writer, "IMPORTS (outbound):")?;
            for dep in &result.outbound {
                if dep.resolved {
                    if let Some(ref path) = dep.path {
                        writeln!(writer, "  {}", path)?;
                        for proto in &dep.prototypes {
                            writeln!(
                                writer,
                                "    [{}] {}   L{}-{}",
                                proto.kind, proto.signature, proto.line_start, proto.line_end
                            )?;
                            if let Some(doc) = &proto.doc_comment {
                                for line in doc.lines() {
                                    writeln!(writer, "      // {}", line)?;
                                }
                            }
                        }
                    }
                } else {
                    writeln!(writer, "  {} (unresolved)", dep.name)?;
                }
            }
            writeln!(writer)?;
        }

        if !result.inbound.is_empty() {
            writeln!(writer, "IMPORTED BY (inbound):")?;
            for dep in &result.inbound {
                if let Some(ref path) = dep.path {
                    let lines: Vec<String> = dep.at_lines.iter().map(|l| l.to_string()).collect();
                    let symbols = dep.symbols_used.join(", ");
                    writeln!(
                        writer,
                        "  {}   L{}   uses {}",
                        path,
                        lines.join(", "),
                        symbols
                    )?;
                }
            }
            writeln!(writer)?;
        }

        if result.outbound.is_empty() && result.inbound.is_empty() {
            writeln!(writer, "No dependencies found.")?;
        }
    }

    Ok(())
}
