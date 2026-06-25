use crate::reader::code::{Dependency, Symbol};
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
