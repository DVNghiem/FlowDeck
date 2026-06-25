use regex::Regex;
use std::path::{Path, PathBuf};

/// A single grep match with context.
#[derive(Debug, Clone)]
pub struct GrepMatch {
    pub line_number: usize,
    pub text: String,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
}

/// Grep result for a single file.
#[derive(Debug, Clone)]
pub struct GrepFileResult {
    pub path: String,
    pub matches: Vec<GrepMatch>,
}

/// Token-optimized grep: regex search with merged context blocks.
pub fn grep_files(
    pattern: &str,
    paths: &[PathBuf],
    context_lines: usize,
    fixed_strings: bool,
    case_sensitive: bool,
    max_matches: usize,
) -> anyhow::Result<(Vec<GrepFileResult>, usize, bool)> {
    let regex = build_regex(pattern, fixed_strings, case_sensitive)?;
    let mut all_results: Vec<GrepFileResult> = Vec::new();
    let mut total_matches = 0usize;
    let mut truncated = false;

    let files = collect_text_files(paths)?;

    for file in files {
        if total_matches >= max_matches {
            truncated = true;
            break;
        }

        let source = match std::fs::read_to_string(&file) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let lines: Vec<&str> = source.lines().collect();
        let mut file_matches: Vec<GrepMatch> = Vec::new();
        let mut match_line_numbers: Vec<usize> = Vec::new();

        for (idx, line) in lines.iter().enumerate() {
            let line_number = idx + 1;
            if regex.is_match(line) {
                match_line_numbers.push(line_number);
            }
        }

        if match_line_numbers.is_empty() {
            continue;
        }

        // Merge adjacent/overlapping context windows
        let merged_ranges = merge_context_ranges(&match_line_numbers, context_lines, lines.len());

        for (start, end, match_lines) in merged_ranges {
            if total_matches >= max_matches {
                truncated = true;
                break;
            }

            let context_before: Vec<String> = if start > 1 {
                lines[start - 2..start - 1]
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            } else {
                Vec::new()
            };

            let context_after: Vec<String> = if end < lines.len() {
                lines[end..end + 1]
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            } else {
                Vec::new()
            };

            // Use the first match line in this range as the primary line
            let primary_line = match_lines.first().copied().unwrap_or(start);
            let text = lines[primary_line - 1].to_string();

            file_matches.push(GrepMatch {
                line_number: primary_line,
                text,
                context_before,
                context_after,
            });

            total_matches += match_lines.len();
        }

        if !file_matches.is_empty() {
            all_results.push(GrepFileResult {
                path: file.to_string_lossy().to_string(),
                matches: file_matches,
            });
        }
    }

    Ok((all_results, total_matches, truncated))
}

fn build_regex(pattern: &str, fixed_strings: bool, case_sensitive: bool) -> anyhow::Result<Regex> {
    let escaped = if fixed_strings {
        regex::escape(pattern)
    } else {
        pattern.to_string()
    };

    let mut builder = regex::RegexBuilder::new(&escaped);
    builder.case_insensitive(!case_sensitive);

    builder.build().map_err(|e| anyhow::anyhow!("Invalid regex: {}", e))
}

fn collect_text_files(paths: &[PathBuf]) -> anyhow::Result<Vec<PathBuf>> {
    use ignore::WalkBuilder;

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
                    // Skip binary files: check for null bytes in first 8KB
                    if is_text_file(&p) {
                        files.push(p);
                    }
                }
            }
        }
    }

    Ok(files)
}

fn is_text_file(path: &Path) -> bool {
    use std::io::Read;

    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };

    let mut buf = [0u8; 8192];
    let n = match file.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return false,
    };

    !buf[..n].contains(&0)
}

/// Merge overlapping or adjacent context ranges.
/// Returns Vec of (range_start, range_end, match_lines_in_range) where range is 1-indexed inclusive.
fn merge_context_ranges(
    match_lines: &[usize],
    context: usize,
    total_lines: usize,
) -> Vec<(usize, usize, Vec<usize>)> {
    if match_lines.is_empty() {
        return Vec::new();
    }

    let mut ranges: Vec<(usize, usize, Vec<usize>)> = Vec::new();

    let first_start = match_lines[0].saturating_sub(context).max(1);
    let first_end = (match_lines[0] + context).min(total_lines);
    ranges.push((first_start, first_end, vec![match_lines[0]]));

    for &line in &match_lines[1..] {
        let start = line.saturating_sub(context).max(1);
        let end = (line + context).min(total_lines);

        let last_idx = ranges.len() - 1;
        let (last_start, last_end, ref mut last_matches) = ranges[last_idx];

        // Merge if within 3 lines of each other (per spec)
        if start <= last_end + 3 {
            ranges[last_idx] = (last_start, end.max(last_end), {
                last_matches.push(line);
                last_matches.clone()
            });
        } else {
            ranges.push((start, end, vec![line]));
        }
    }

    ranges
}
