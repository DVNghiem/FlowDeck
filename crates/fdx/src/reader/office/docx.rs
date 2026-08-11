//! .docx parser: walks `word/document.xml` and renders body text + tables
//! to markdown.

use std::fs;
use std::io::Cursor;
use std::path::Path;

use quick_xml::escape::unescape;
use quick_xml::events::Event;
use quick_xml::reader::Reader;

/// Parse a .docx file and return its markdown rendering.
///
/// `warnings` collects non-fatal issues (skipped images, comments,
/// tracked changes, fields).
pub fn parse_docx(path: &Path, warnings: &mut Vec<String>) -> anyhow::Result<String> {
    let bytes = fs::read(path)?;
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))?;

    let mut body_md = String::new();
    {
        let mut doc_xml = String::new();
        use std::io::Read;
        zip.by_name("word/document.xml")?.read_to_string(&mut doc_xml)?;
        render_part(&doc_xml, &mut body_md, warnings);
    }

    let header_md = collect_header_footer(&mut zip, "word/header", warnings);
    let footer_md = collect_header_footer(&mut zip, "word/footer", warnings);

    let mut out = String::new();
    if !header_md.is_empty() {
        for line in header_md.lines() {
            out.push_str("> ");
            out.push_str(line);
            out.push('\n');
        }
        out.push('\n');
    }
    out.push_str(&body_md);
    if !footer_md.is_empty() {
        out.push('\n');
        for line in footer_md.lines() {
            out.push_str("> ");
            out.push_str(line);
            out.push('\n');
        }
    }
    Ok(out.trim_end().to_string())
}

/// Walk a single OOXML part (`document.xml` or a header/footer file) and
/// append its markdown rendering to `out`.
fn render_part(xml: &str, out: &mut String, warnings: &mut Vec<String>) {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut buf = Vec::new();
    let mut state = WalkerState::default();

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => {
                warnings.push(format!("xml parse warning: {e}"));
                return;
            }
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) => state.on_start(e.name().as_ref()),
            Ok(Event::End(e)) => state.on_end(e.name().as_ref(), out),
            Ok(Event::Text(t)) if state.collecting_text => {
                if let Ok(decoded) = t.decode() {
                    if let Ok(text) = unescape(&decoded) {
                        state.buffer.push_str(&text);
                    }
                }
            }
            _ => {}
        }
        buf.clear();
    }
}

#[derive(Default)]
struct WalkerState {
    in_paragraph: bool,
    in_cell: bool,
    in_table: bool,
    row_cells: Vec<String>,
    cell_text: String,
    paragraph_text: String,
    table_rows: Vec<Vec<String>>,
    collecting_text: bool,
    buffer: String,
}

impl WalkerState {
    fn on_start(&mut self, name: &[u8]) {
        match name {
            b"w:p" => {
                self.in_paragraph = true;
                self.paragraph_text.clear();
            }
            b"w:r" => {
                self.collecting_text = true;
                self.buffer.clear();
            }
            b"w:tbl" => {
                self.in_table = true;
                self.table_rows.clear();
            }
            b"w:tr" => {
                self.row_cells.clear();
            }
            b"w:tc" => {
                self.in_cell = true;
                self.cell_text.clear();
            }
            b"w:drawing" | b"w:fldSimple" | b"w:instrText" | b"w:ins" | b"w:del" => {
                self.collecting_text = false;
            }
            _ => {}
        }
    }

    fn on_end(&mut self, name: &[u8], out: &mut String) {
        match name {
            b"w:t" => {}
            b"w:r" => {
                self.collecting_text = false;
                if self.in_cell {
                    self.cell_text.push_str(&self.buffer);
                    self.buffer.clear();
                } else if self.in_paragraph {
                    self.paragraph_text.push_str(&self.buffer);
                    self.buffer.clear();
                }
            }
            b"w:p" => {
                self.in_paragraph = false;
                if self.in_cell {
                    // paragraph inside a cell — already accumulated
                } else {
                    out.push_str(self.paragraph_text.trim_end());
                    out.push('\n');
                }
            }
            b"w:tc" => {
                self.in_cell = false;
                self.row_cells.push(self.cell_text.trim().to_string());
                self.cell_text.clear();
            }
            b"w:tr" => {
                self.table_rows.push(std::mem::take(&mut self.row_cells));
            }
            b"w:tbl" => {
                self.in_table = false;
                render_table(out, &self.table_rows);
                self.table_rows.clear();
            }
            _ => {}
        }
    }
}

fn render_table(out: &mut String, rows: &[Vec<String>]) {
    if rows.is_empty() {
        return;
    }
    // Header row (first row)
    let header = &rows[0];
    out.push('|');
    for cell in header {
        out.push(' ');
        out.push_str(&escape_cell(cell));
        out.push_str(" |");
    }
    out.push('\n');
    out.push('|');
    for _ in header {
        out.push_str(" --- |");
    }
    out.push('\n');
    for row in &rows[1..] {
        out.push('|');
        for cell in row {
            out.push(' ');
            out.push_str(&escape_cell(cell));
            out.push_str(" |");
        }
        out.push('\n');
    }
}

fn escape_cell(s: &str) -> String {
    s.replace('|', "\\|").replace('\n', " ")
}

/// Read up to 10 header or footer parts (`word/header1.xml` ..
/// `word/header10.xml`) and concatenate their markdown renderings.
fn collect_header_footer<R: std::io::Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    stem: &str,
    warnings: &mut Vec<String>,
) -> String {
    let mut out = String::new();
    for i in 1..=10 {
        let name = format!("{stem}{i}.xml");
        let mut entry = match zip.by_name(&name) {
            Ok(e) => e,
            Err(_) => continue,
        };
        use std::io::Read;
        let mut xml = String::new();
        if entry.read_to_string(&mut xml).is_err() {
            warnings.push(format!("could not read {name}"));
            continue;
        }
        render_part(&xml, &mut out, warnings);
    }
    out
}
