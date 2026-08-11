//! .docx parser: walks `word/document.xml` and renders body text + tables
//! to markdown.

use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;

/// Parse a .docx file and return its markdown rendering.
///
/// `warnings` collects non-fatal issues (skipped images, comments,
/// tracked changes, etc.).
pub fn parse_docx(path: &Path, warnings: &mut Vec<String>) -> anyhow::Result<String> {
    let bytes = fs::read(path)?;
    // Full implementation arrives in Task 3. Stub returns raw text from
    // `word/document.xml` to keep the crate compiling.
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))?;
    let mut doc = String::new();
    zip.by_name("word/document.xml")?.read_to_string(&mut doc)?;
    warnings.push("docx parser is a stub — Task 3 will replace this body".to_string());
    Ok(doc)
}
