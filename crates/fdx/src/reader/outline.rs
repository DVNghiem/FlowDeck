use crate::reader::code::{
    cache::AstCache,
    languages::detect_language,
    parser::parse_source,
    prototype::PrototypeReader,
    Symbol,
};
use ignore::WalkBuilder;
use std::path::PathBuf;

/// Options controlling outline generation.
#[derive(Debug, Clone)]
pub struct OutlineOptions {
    pub depth: Option<usize>,
    pub kind_filter: Option<Vec<String>>,
    pub min_lines: usize,
    pub no_cache: bool,
}

impl Default for OutlineOptions {
    fn default() -> Self {
        Self {
            depth: None,
            kind_filter: None,
            min_lines: 1,
            no_cache: false,
        }
    }
}

/// Symbol outline for a single file.
#[derive(Debug, Clone)]
pub struct OutlineFileResult {
    pub path: String,
    pub language: String,
    pub total_lines: usize,
    pub symbols: Vec<Symbol>,
    pub parse_error: Option<String>,
}

/// Generate a symbol outline for the given paths.
pub fn outline_paths(
    paths: &[PathBuf],
    options: &OutlineOptions,
    cache: &AstCache,
) -> anyhow::Result<Vec<OutlineFileResult>> {
    let mut results = Vec::new();
    let files = collect_files(paths, options.depth)?;

    for file in files {
        let source = match std::fs::read_to_string(&file) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let total_lines = source.lines().count();

        let provider = match detect_language(&file) {
            Some(p) => p,
            None => continue,
        };

        let tree = if options.no_cache {
            match parse_source(&source, (provider.grammar)()) {
                Ok(t) => t,
                Err(e) => {
                    results.push(OutlineFileResult {
                        path: file.to_string_lossy().to_string(),
                        language: provider.name.to_string(),
                        total_lines,
                        symbols: Vec::new(),
                        parse_error: Some(e.to_string()),
                    });
                    continue;
                }
            }
        } else {
            let metadata = match std::fs::metadata(&file) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let mtime = match metadata.modified() {
                Ok(t) => t,
                Err(_) => continue,
            };
            let path_buf = file.clone();

            if let Some(cached_tree) = cache.get(&path_buf, mtime) {
                cached_tree
            } else {
                match parse_source(&source, (provider.grammar)()) {
                    Ok(t) => {
                        cache.insert(path_buf, mtime, t.clone());
                        t
                    }
                    Err(e) => {
                        results.push(OutlineFileResult {
                            path: file.to_string_lossy().to_string(),
                            language: provider.name.to_string(),
                            total_lines,
                            symbols: Vec::new(),
                            parse_error: Some(e.to_string()),
                        });
                        continue;
                    }
                }
            }
        };

        let reader = PrototypeReader::new();
        let mut symbols = match reader.extract_prototypes(&file, &source, &tree) {
            Ok(s) => s,
            Err(e) => {
                results.push(OutlineFileResult {
                    path: file.to_string_lossy().to_string(),
                    language: provider.name.to_string(),
                    total_lines,
                    symbols: Vec::new(),
                    parse_error: Some(e.to_string()),
                });
                continue;
            }
        };

        // Apply kind filter
        if let Some(ref kinds) = options.kind_filter {
            symbols.retain(|s| kinds.iter().any(|k| s.kind.eq_ignore_ascii_case(k)));
        }

        // Apply min-lines filter
        if options.min_lines > 1 {
            symbols.retain(|s| {
                let lines = s.line_end.saturating_sub(s.line_start) + 1;
                lines >= options.min_lines
            });
        }

        results.push(OutlineFileResult {
            path: file.to_string_lossy().to_string(),
            language: provider.name.to_string(),
            total_lines,
            symbols,
            parse_error: None,
        });
    }

    // Sort by path for stable output
    results.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(results)
}

/// Collect code files from paths, respecting .gitignore and optional depth limit.
fn collect_files(paths: &[PathBuf], max_depth: Option<usize>) -> anyhow::Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    for path in paths {
        if path.is_file() {
            if detect_language(path).is_some() {
                files.push(path.clone());
            }
        } else if path.is_dir() {
            let mut builder = WalkBuilder::new(path);
            builder.hidden(false).git_ignore(true);

            if let Some(depth) = max_depth {
                builder.max_depth(Some(depth + 1)); // +1 because WalkBuilder counts from 0
            }

            for entry in builder.build() {
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };

                if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                    let p = entry.path().to_path_buf();
                    if detect_language(&p).is_some() {
                        files.push(p);
                    }
                }
            }
        }
    }

    Ok(files)
}
