use crate::reader::code::{
    cache::AstCache,
    CodeResult,
};
use crate::reader::{read_file, ReadMode, ReaderOptions, ReadResult};
use std::path::PathBuf;

/// Result of processing a single file in a batch.
#[derive(Debug, Clone)]
pub enum BatchItem {
    Ok(CodeResult),
    Text(crate::reader::text::TextResult),
    ParseError { path: String, error: String },
}

/// Read multiple files in one call.
pub fn batch_read(
    patterns: &[String],
    mode: ReadMode,
    symbol: Option<&str>,
    format: crate::output::OutputFormat,
    no_cache: bool,
    max_files: usize,
    cache: &AstCache,
) -> anyhow::Result<(Vec<BatchItem>, usize, bool)> {
    let paths = expand_patterns(patterns)?;
    let mut items = Vec::new();
    let mut truncated = false;

    let files_to_process: Vec<PathBuf> = paths
        .into_iter()
        .filter(|p| p.is_file())
        .take(max_files)
        .collect();

    if files_to_process.len() >= max_files {
        truncated = true;
    }

    for file in files_to_process {
        let options = ReaderOptions {
            mode,
            symbol: symbol.map(|s| s.to_string()),
            limit: None,
            offset: 1,
            with_deps: true,
            format: format.clone(),
            no_cache,
        };

        match read_file(&file, &options, cache) {
            Ok(ReadResult::Code(code_result)) => {
                items.push(BatchItem::Ok(code_result));
            }
            Ok(ReadResult::Text(text_result)) => {
                items.push(BatchItem::Text(text_result));
            }
            Err(e) => {
                items.push(BatchItem::ParseError {
                    path: file.to_string_lossy().to_string(),
                    error: e.to_string(),
                });
            }
        }
    }

    let count = items.len();
    Ok((items, count, truncated))
}

/// Expand glob patterns and explicit paths into a list of file paths.
fn expand_patterns(patterns: &[String]) -> anyhow::Result<Vec<PathBuf>> {
    let mut paths = Vec::new();

    for pattern in patterns {
        if pattern.contains('*') || pattern.contains('?') {
            // Glob pattern
            let entries = glob::glob(pattern)?;
            for entry in entries {
                match entry {
                    Ok(path) => paths.push(path),
                    Err(_) => continue,
                }
            }
        } else {
            // Explicit path
            paths.push(PathBuf::from(pattern));
        }
    }

    Ok(paths)
}
