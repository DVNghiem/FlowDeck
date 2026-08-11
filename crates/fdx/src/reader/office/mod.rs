//! Office document extraction: .docx (Word) and .xlsx (Excel).
//!
//! Office files are OOXML — ZIP containers with `[Content_Types].xml`
//! declaring the package's content. We sniff by magic bytes + content type
//! and dispatch to the appropriate extractor.

pub mod detect;
pub mod docx;
pub mod xlsx;
pub mod markdown;

use std::path::Path;

use serde::{Deserialize, Serialize};

/// Result of extracting an Office document into markdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficeResult {
    /// Absolute or user-supplied path to the source file.
    pub path: String,
    /// Either "docx" or "xlsx".
    pub format: String,
    /// The rendered markdown body.
    pub markdown: String,
    /// Non-fatal extraction notes (e.g. "skipped 1 embedded object").
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// Hard cap on rendered markdown size per file (10 MB per spec).
const MAX_MARKDOWN_BYTES: usize = 10 * 1024 * 1024;

/// Read an Office file and return its markdown rendering.
///
/// Calls `detect` first; if the file is not Office, returns an error
/// directing the caller to fall back to the text/code paths.
pub fn read_office(path: &Path) -> anyhow::Result<OfficeResult> {
    let kind = detect::detect(path)?;
    let mut warnings = Vec::new();
    let (format, markdown) = match kind {
        detect::OfficeKind::Docx => ("docx", docx::parse_docx(path, &mut warnings)?),
        detect::OfficeKind::Xlsx => ("xlsx", xlsx::parse_xlsx(path, &mut warnings)?),
        detect::OfficeKind::None => {
            anyhow::bail!("not an Office document: {}", path.display())
        }
    };
    if markdown.len() > MAX_MARKDOWN_BYTES {
        anyhow::bail!(
            "office extraction exceeded 10MB markdown output. Use --limit to reduce output."
        );
    }
    Ok(OfficeResult {
        path: path.to_string_lossy().to_string(),
        format: format.to_string(),
        markdown,
        warnings,
    })
}
