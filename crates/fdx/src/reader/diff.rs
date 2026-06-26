use crate::reader::code::{
    cache::AstCache,
    languages::detect_language,
    parser::parse_source,
    prototype::PrototypeReader,
};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Options controlling diff generation.
#[derive(Debug, Clone)]
pub struct DiffOptions {
    pub commit: String,
    pub staged: bool,
    pub paths: Vec<PathBuf>,
    pub no_cache: bool,
    pub root: PathBuf,
}

impl Default for DiffOptions {
    fn default() -> Self {
        Self {
            commit: "HEAD~1".to_string(),
            staged: false,
            paths: Vec::new(),
            no_cache: false,
            root: PathBuf::from("."),
        }
    }
}

/// Change classification for a symbol.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeType {
    SignatureChanged,
    BodyChanged,
    Added,
    Deleted,
    FileLevel,
}

impl std::fmt::Display for ChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ChangeType::SignatureChanged => write!(f, "signature_changed"),
            ChangeType::BodyChanged => write!(f, "body_changed"),
            ChangeType::Added => write!(f, "added"),
            ChangeType::Deleted => write!(f, "deleted"),
            ChangeType::FileLevel => write!(f, "file_level"),
        }
    }
}

/// A single symbol-level change.
#[derive(Debug, Clone)]
pub struct SymbolChange {
    pub kind: String,
    pub name: String,
    pub change_type: ChangeType,
    pub line_start: usize,
    pub line_end: usize,
    pub lines_added: usize,
    pub lines_removed: usize,
}

/// A file-level change (imports, top-level statements, etc.).
#[derive(Debug, Clone)]
pub struct FileLevelChange {
    pub line_start: usize,
    pub line_end: usize,
    pub lines_added: usize,
    pub lines_removed: usize,
    pub raw_lines: Vec<String>,
}

/// Diff result for a single file.
#[derive(Debug, Clone)]
pub struct DiffFileResult {
    pub path: String,
    pub status: FileStatus,
    pub language: Option<String>,
    pub symbol_changes: Vec<SymbolChange>,
    pub file_level_changes: Vec<FileLevelChange>,
    pub lines_added: usize,
    pub lines_removed: usize,
}

/// File change status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileStatus {
    Modified,
    Added,
    Deleted,
}

impl std::fmt::Display for FileStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            FileStatus::Modified => write!(f, "modified"),
            FileStatus::Added => write!(f, "added"),
            FileStatus::Deleted => write!(f, "deleted"),
        }
    }
}

/// Generate a symbol-aware diff against a git ref.
pub fn diff_against(options: &DiffOptions, cache: &AstCache) -> anyhow::Result<Vec<DiffFileResult>> {
    // Verify git is available and we're in a repo
    let git_check = Command::new("git")
        .arg("rev-parse")
        .arg("--git-dir")
        .current_dir(&options.root)
        .output()?;

    if !git_check.status.success() {
        anyhow::bail!("error: not a git repository (or git not found)");
    }

    // Build git diff command
    let mut cmd = Command::new("git");
    cmd.arg("diff").arg("--unified=3").current_dir(&options.root);

    if options.staged {
        cmd.arg("--cached");
    } else {
        cmd.arg(&options.commit);
    }

    if !options.paths.is_empty() {
        cmd.arg("--");
        for path in &options.paths {
            cmd.arg(path);
        }
    }

    let output = cmd.output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("git diff failed: {}", stderr);
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);

    if diff_text.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Parse unified diff
    let mut patch = unidiff::PatchSet::new();
    patch.parse(&diff_text)
        .map_err(|e| anyhow::anyhow!("Failed to parse diff: {}", e))?;

    let mut results = Vec::new();

    for patched_file in patch.files() {
        let path = patched_file.path();
        let status = if patched_file.is_added_file() {
            FileStatus::Added
        } else if patched_file.is_removed_file() {
            FileStatus::Deleted
        } else {
            FileStatus::Modified
        };

        let lines_added = patched_file.added();
        let lines_removed = patched_file.removed();

        // For deleted files, we can't parse the current version
        if status == FileStatus::Deleted {
            results.push(DiffFileResult {
                path,
                status,
                language: None,
                symbol_changes: Vec::new(),
                file_level_changes: Vec::new(),
                lines_added,
                lines_removed,
            });
            continue;
        }

        // For added/modified files, try to parse current version
        let file_path = options.root.join(&path);
        let provider = detect_language(&file_path);

        let (symbol_changes, file_level_changes) = if let Some(ref prov) = provider {
            match analyze_file_changes(&file_path,
                patched_file,
                prov,
                cache,
                options.no_cache,
            ) {
                Ok((sc, flc)) => (sc, flc),
                Err(_) => {
                    // Parse error — report as plain file change
                    (Vec::new(), Vec::new())
                }
            }
        } else {
            // Non-code file — no symbol resolution
            (Vec::new(), Vec::new())
        };

        results.push(DiffFileResult {
            path,
            status,
            language: provider.map(|p| p.name.to_string()),
            symbol_changes,
            file_level_changes,
            lines_added,
            lines_removed,
        });
    }

    Ok(results)
}

/// Analyze changes for a single file, resolving to symbols.
fn analyze_file_changes(
    file_path: &Path,
    patched_file: &unidiff::PatchedFile,
    provider: &crate::reader::code::languages::LanguageProvider,
    cache: &AstCache,
    no_cache: bool,
) -> anyhow::Result<(Vec<SymbolChange>, Vec<FileLevelChange>)> {
    let source = std::fs::read_to_string(file_path)?;

    let tree = if no_cache {
        parse_source(&source, (provider.grammar)())?
    } else {
        let metadata = std::fs::metadata(file_path)?;
        let mtime = metadata.modified()?;
        let path_buf = file_path.to_path_buf();

        if let Some(cached_tree) = cache.get(&path_buf, mtime) {
            cached_tree
        } else {
            let tree = parse_source(&source, (provider.grammar)())?;
            cache.insert(path_buf, mtime, tree.clone());
            tree
        }
    };

    let reader = PrototypeReader::new();
    let symbols = reader.extract_prototypes(file_path, &source, &tree)?;

    // Collect all changed line ranges from the diff
    let mut changed_lines: Vec<(usize, ChangeType)> = Vec::new(); // (target_line_number, change_type)

    for hunk in patched_file.hunks() {
        for line in hunk.lines() {
            if line.is_added() {
                if let Some(target_line) = line.target_line_no {
                    changed_lines.push((target_line, ChangeType::Added));
                }
            } else if line.is_removed() {
                if let Some(source_line) = line.source_line_no {
                    changed_lines.push((source_line, ChangeType::Deleted));
                }
            }
        }
    }

    // Map changed lines to symbols
    let mut symbol_change_map: std::collections::HashMap<String, (ChangeType, usize, usize, usize, usize)> =
        std::collections::HashMap::new();
    // name -> (change_type, line_start, line_end, lines_added, lines_removed)

    let mut file_level_raw: Vec<(usize, String, ChangeType)> = Vec::new();

    for (line_no, change_type) in changed_lines {
        let mut matched_symbol = false;

        for sym in &symbols {
            if line_no >= sym.line_start && line_no <= sym.line_end {
                matched_symbol = true;

                // Determine if signature or body changed
                // Signature is the first line of the symbol
                let is_signature_line = line_no == sym.line_start;

                let entry = symbol_change_map
                    .entry(sym.name.clone())
                    .or_insert_with(|| {
                        (
                            if is_signature_line {
                                ChangeType::SignatureChanged
                            } else {
                                ChangeType::BodyChanged
                            },
                            sym.line_start,
                            sym.line_end,
                            0,
                            0,
                        )
                    });

                // Upgrade body_changed to signature_changed if needed
                if is_signature_line && entry.0 == ChangeType::BodyChanged {
                    entry.0 = ChangeType::SignatureChanged;
                }

                if change_type == ChangeType::Added {
                    entry.3 += 1;
                } else {
                    entry.4 += 1;
                }

                break; // A line belongs to one symbol
            }
        }

        if !matched_symbol {
            // File-level change
            let raw = if change_type == ChangeType::Added {
                format!("+ {}", source.lines().nth(line_no - 1).unwrap_or(""))
            } else {
                format!("- {}", source.lines().nth(line_no - 1).unwrap_or(""))
            };
            file_level_raw.push((line_no, raw, change_type));
        }
    }

    // Build symbol changes
    let mut symbol_changes: Vec<SymbolChange> = Vec::new();
    for sym in &symbols {
        if let Some((change_type, line_start, line_end, lines_added, lines_removed)) =
            symbol_change_map.get(&sym.name)
        {
            symbol_changes.push(SymbolChange {
                kind: sym.kind.clone(),
                name: sym.name.clone(),
                change_type: change_type.clone(),
                line_start: *line_start,
                line_end: *line_end,
                lines_added: *lines_added,
                lines_removed: *lines_removed,
            });
        }
    }

    // Preserve source order
    symbol_changes.sort_by_key(|sc| sc.line_start);

    // Build file-level changes — group contiguous lines
    let mut file_level_changes = Vec::new();
    if !file_level_raw.is_empty() {
        file_level_raw.sort_by_key(|(line, _, _)| *line);

        let mut current_start = file_level_raw[0].0;
        let mut current_end = file_level_raw[0].0;
        let mut current_raw: Vec<String> = vec![file_level_raw[0].1.clone()];
        let mut current_added = if file_level_raw[0].2 == ChangeType::Added { 1 } else { 0 };
        let mut current_removed = if file_level_raw[0].2 == ChangeType::Deleted { 1 } else { 0 };

        for item in file_level_raw.iter().skip(1) {
            let (line_no, raw, change_type) = item;

            if *line_no <= current_end + 1 {
                // Contiguous
                current_end = *line_no;
                current_raw.push(raw.clone());
                if *change_type == ChangeType::Added {
                    current_added += 1;
                } else {
                    current_removed += 1;
                }
            } else {
                // New group
                file_level_changes.push(FileLevelChange {
                    line_start: current_start,
                    line_end: current_end,
                    lines_added: current_added,
                    lines_removed: current_removed,
                    raw_lines: current_raw,
                });
                current_start = *line_no;
                current_end = *line_no;
                current_raw = vec![raw.clone()];
                current_added = if *change_type == ChangeType::Added { 1 } else { 0 };
                current_removed = if *change_type == ChangeType::Deleted { 1 } else { 0 };
            }
        }

        file_level_changes.push(FileLevelChange {
            line_start: current_start,
            line_end: current_end,
            lines_added: current_added,
            lines_removed: current_removed,
            raw_lines: current_raw,
        });
    }

    Ok((symbol_changes, file_level_changes))
}
