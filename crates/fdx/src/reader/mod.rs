pub mod batch;
pub mod code;
pub mod diff;
pub mod grep;
pub mod impact;
pub mod outline;
pub mod search;
pub mod text;

use crate::output::OutputFormat;
use crate::reader::code::{
    cache::AstCache,
    deep::DeepReader,
    languages::detect_language,
    parser::parse_source,
    prototype::PrototypeReader,
    CodeReader, CodeResult
};
use crate::reader::text::{read_text, TextResult};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReadMode {
    Auto,
    Raw,
    Prototype,
    Deep,
}

impl Default for ReadMode {
    fn default() -> Self {
        ReadMode::Auto
    }
}

impl std::str::FromStr for ReadMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "auto" => Ok(ReadMode::Auto),
            "raw" => Ok(ReadMode::Raw),
            "prototype" => Ok(ReadMode::Prototype),
            "deep" => Ok(ReadMode::Deep),
            _ => Err(format!("Unknown read mode: {}", s)),
        }
    }
}

pub struct ReaderOptions {
    pub mode: ReadMode,
    pub symbol: Option<String>,
    pub limit: Option<usize>,
    pub offset: usize,
    pub with_deps: bool,
    pub format: OutputFormat,
    pub no_cache: bool,
}

impl Clone for ReaderOptions {
    fn clone(&self) -> Self {
        Self {
            mode: self.mode,
            symbol: self.symbol.clone(),
            limit: self.limit,
            offset: self.offset,
            with_deps: self.with_deps,
            format: self.format.clone(),
            no_cache: self.no_cache,
        }
    }
}

impl Default for ReaderOptions {
    fn default() -> Self {
        Self {
            mode: ReadMode::Auto,
            symbol: None,
            limit: None,
            offset: 1,
            with_deps: true,
            format: OutputFormat::default(),
            no_cache: false,
        }
    }
}

pub enum ReadResult {
    Code(CodeResult),
    Text(TextResult),
}

pub fn read_file(path: &Path, options: &ReaderOptions, cache: &AstCache) -> anyhow::Result<ReadResult> {
    let is_code_file = detect_language(path).is_some();

    let effective_mode = match options.mode {
        ReadMode::Auto => {
            if is_code_file {
                ReadMode::Prototype
            } else {
                ReadMode::Raw
            }
        }
        ReadMode::Raw => ReadMode::Raw,
        ReadMode::Prototype => ReadMode::Prototype,
        ReadMode::Deep => ReadMode::Deep,
    };

    match effective_mode {
        ReadMode::Raw => {
            let result = read_text(path, options.offset, options.limit)?;
            Ok(ReadResult::Text(result))
        }
        ReadMode::Prototype => {
            let source = std::fs::read_to_string(path)?;
            let total_lines = source.lines().count();

            let provider = detect_language(path)
                .ok_or_else(|| anyhow::anyhow!("Failed to detect language for prototype mode"))?;

            let tree = if options.no_cache {
                parse_source(&source, (provider.grammar)())?
            } else {
                let metadata = std::fs::metadata(path)?;
                let mtime = metadata.modified()?;
                let path_buf = path.to_path_buf();

                if let Some(cached_tree) = cache.get(&path_buf, mtime) {
                    cached_tree
                } else {
                    let tree = parse_source(&source, (provider.grammar)())?;
                    cache.insert(path_buf, mtime, tree.clone());
                    tree
                }
            };

            let reader = PrototypeReader::new();
            let symbols = reader.extract_prototypes(path, &source, &tree)?;

            Ok(ReadResult::Code(CodeResult {
                path: path.to_string_lossy().to_string(),
                language: provider.name.to_string(),
                mode: "prototype".to_string(),
                total_lines,
                symbols,
                dependencies: vec![],
                parse_error: None,
            }))
        }
        ReadMode::Deep => {
            let source = std::fs::read_to_string(path)?;
            let total_lines = source.lines().count();

            let provider = detect_language(path)
                .ok_or_else(|| anyhow::anyhow!("Failed to detect language for deep mode"))?;

            let tree = if options.no_cache {
                parse_source(&source, (provider.grammar)())?
            } else {
                let metadata = std::fs::metadata(path)?;
                let mtime = metadata.modified()?;
                let path_buf = path.to_path_buf();

                if let Some(cached_tree) = cache.get(&path_buf, mtime) {
                    cached_tree
                } else {
                    let tree = parse_source(&source, (provider.grammar)())?;
                    cache.insert(path_buf, mtime, tree.clone());
                    tree
                }
            };

            let reader = DeepReader::new();
            let mut result = reader.read_deep(
                path,
                &source,
                &tree,
                options.symbol.as_deref(),
                options.with_deps,
            )?;
            result.language = provider.name.to_string();
            result.total_lines = total_lines;

            Ok(ReadResult::Code(result))
        }
        ReadMode::Auto => unreachable!(),
    }
}
