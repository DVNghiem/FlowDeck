use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextResult {
    pub path: String,
    pub language: String,
    pub mode: String,
    pub total_lines: usize,
    pub offset: usize,
    pub returned_lines: usize,
    pub lines: Vec<String>,
    pub parse_error: Option<String>,
}

pub fn read_text(path: &Path, offset: usize, limit: Option<usize>) -> anyhow::Result<TextResult> {
    let content = fs::read_to_string(path)?;
    let all_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let total_lines = all_lines.len();

    let start = if offset > 0 { offset - 1 } else { 0 };
    let start = start.min(total_lines);

    let end = if let Some(lim) = limit {
        (start + lim).min(total_lines)
    } else {
        total_lines
    };

    let lines = all_lines[start..end].to_vec();
    let returned_lines = lines.len();

    Ok(TextResult {
        path: path.to_string_lossy().to_string(),
        language: "text".to_string(),
        mode: "raw".to_string(),
        total_lines,
        offset,
        returned_lines,
        lines,
        parse_error: None,
    })
}
