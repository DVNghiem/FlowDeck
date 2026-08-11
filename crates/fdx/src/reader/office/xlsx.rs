//! .xlsx parser: iterates sheets via calamine and renders each sheet as a
//! markdown pipe table.

use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};

const ROW_LIMIT: usize = 1000;

/// Parse a .xlsx file and return its markdown rendering.
///
/// Each sheet becomes `## Sheet: <name>` followed by a GFM pipe table.
/// Sheets exceeding `ROW_LIMIT` rows are truncated with a warning.
pub fn parse_xlsx(path: &Path, warnings: &mut Vec<String>) -> anyhow::Result<String> {
    let mut book = open_workbook_auto(path)?;
    let sheet_names = book.sheet_names().to_vec();

    let mut out = String::new();
    for name in sheet_names {
        let range = match book.worksheet_range(&name) {
            Ok(r) => r,
            Err(e) => {
                warnings.push(format!("sheet '{name}' failed: {e}"));
                continue;
            }
        };

        let (height, width) = range.get_size();
        out.push_str(&format!("## Sheet: {name}\n"));

        if height == 0 || width == 0 {
            out.push('\n');
            continue;
        }

        let rendered = height.min(ROW_LIMIT);
        if height > ROW_LIMIT {
            warnings.push(format!(
                "sheet '{name}' truncated, {more} more rows",
                name = name,
                more = height - ROW_LIMIT
            ));
        }

        // Header row
        out.push('|');
        for c in 0..width {
            out.push(' ');
            out.push_str(&cell_md(&range[(0, c)]));
            out.push_str(" |");
        }
        out.push('\n');

        // Separator
        out.push('|');
        for _ in 0..width {
            out.push_str(" --- |");
        }
        out.push('\n');

        // Data rows
        for r in 1..rendered {
            out.push('|');
            for c in 0..width {
                out.push(' ');
                out.push_str(&cell_md(&range[(r, c)]));
                out.push_str(" |");
            }
            out.push('\n');
        }

        if height > ROW_LIMIT {
            out.push_str(&format!(
                "> (truncated, {} more rows)\n",
                height - ROW_LIMIT
            ));
        }
        out.push('\n');
    }

    Ok(out.trim_end().to_string())
}

fn cell_md(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) => escape_cell(s),
        Data::Float(f) => {
            // Integers render without trailing `.0`; others as-is.
            if f.fract() == 0.0 && f.is_finite() && f.abs() < 1e15 {
                format!("{}", *f as i64)
            } else {
                format!("{f}")
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(d) => format!("{d}"),
        Data::DateTimeIso(s) | Data::DurationIso(s) => escape_cell(s),
        Data::Error(e) => format!("#ERR:{e:?}"),
    }
}

fn escape_cell(s: &str) -> String {
    s.replace('|', "\\|").replace('\n', " ")
}