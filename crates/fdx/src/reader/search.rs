use crate::reader::code::{
    cache::AstCache,
    languages::detect_language,
    parser::parse_source,
    prototype::PrototypeReader,
    Symbol,
};
use ignore::WalkBuilder;
use std::path::PathBuf;

/// A single search match: file path + symbol.
#[derive(Debug, Clone)]
pub struct SearchMatch {
    pub path: String,
    pub symbol: Symbol,
}

/// Search for symbols by name pattern across files/directories.
pub fn search_symbols(
    pattern: &str,
    paths: &[PathBuf],
    kind_filter: Option<&str>,
    no_cache: bool,
    cache: &AstCache,
) -> anyhow::Result<Vec<SearchMatch>> {
    let pattern_lower = pattern.to_lowercase();
    let mut matches = Vec::new();

    let files = collect_code_files(paths)?;

    for file in files {
        let source = match std::fs::read_to_string(&file) {
            Ok(s) => s,
            Err(_) => continue, // Skip unreadable files
        };

        let provider = match detect_language(&file) {
            Some(p) => p,
            None => continue,
        };

        let tree = if no_cache {
            match parse_source(&source, (provider.grammar)()) {
                Ok(t) => t,
                Err(_) => continue,
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
                    Err(_) => continue,
                }
            }
        };

        let reader = PrototypeReader::new();
        let symbols = match reader.extract_prototypes(&file, &source, &tree) {
            Ok(s) => s,
            Err(_) => continue,
        };

        for sym in symbols {
            // Case-insensitive substring match on name
            if !sym.name.to_lowercase().contains(&pattern_lower) {
                continue;
            }

            // Kind filter
            if let Some(filter) = kind_filter {
                if sym.kind != filter {
                    continue;
                }
            }

            matches.push(SearchMatch {
                path: file.to_string_lossy().to_string(),
                symbol: sym,
            });
        }
    }

    Ok(matches)
}

/// Collect all code files from paths, respecting .gitignore.
fn collect_code_files(paths: &[PathBuf]) -> anyhow::Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    for path in paths {
        if path.is_file() {
            files.push(path.clone());
        } else if path.is_dir() {
            let walker = WalkBuilder::new(path)
                .hidden(false)
                .git_ignore(true)
                .build();

            for entry in walker {
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
