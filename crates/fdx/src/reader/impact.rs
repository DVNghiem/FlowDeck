use crate::reader::code::{
    cache::AstCache,
    languages::{detect_language, LanguageProvider},
    parser::parse_source,
    prototype::PrototypeReader,
    queries, Symbol,
};
use ignore::WalkBuilder;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// An import reference found in a file.
#[derive(Debug, Clone)]
pub struct ImportRef {
    pub name: String,
    pub resolved_path: Option<PathBuf>,
    pub line_number: usize,
}

/// A dependency entry for impact analysis.
#[derive(Debug, Clone)]
pub struct ImpactDep {
    pub path: Option<String>,
    pub resolved: bool,
    pub name: String,
    pub symbols_used: Vec<String>,
    pub at_lines: Vec<usize>,
    pub prototypes: Vec<Symbol>,
}

/// Impact analysis result for a single target file.
#[derive(Debug, Clone)]
pub struct ImpactResult {
    pub target: String,
    pub depth: usize,
    pub outbound: Vec<ImpactDep>,
    pub inbound: Vec<ImpactDep>,
}

/// Analyze cross-file dependencies for one or more target files.
pub fn analyze_impact(
    targets: &[PathBuf],
    root: &Path,
    depth: usize,
    direction: ImpactDirection,
    cache: &AstCache,
) -> anyhow::Result<Vec<ImpactResult>> {
    let mut results = Vec::new();

    // Pre-index all code files under root
    let all_files = collect_code_files(root)?;
    let file_index: HashMap<PathBuf, String> = all_files
        .iter()
        .filter_map(|p| std::fs::read_to_string(p).ok().map(|s| (p.clone(), s)))
        .collect();

    for target in targets {
        let target_str = target.to_string_lossy().to_string();
        let target_source = match std::fs::read_to_string(target) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let mut outbound = Vec::new();
        let mut inbound = Vec::new();

        if direction == ImpactDirection::Out || direction == ImpactDirection::Both {
            let direct = find_outbound_deps(target, &target_source, root, &file_index, cache)?;
            outbound.extend(direct);

            if depth >= 2 {
                let mut seen = HashSet::new();
                for dep in &outbound {
                    if let Some(ref path_str) = dep.path {
                        let dep_path = PathBuf::from(path_str);
                        if seen.contains(&dep_path) {
                            continue;
                        }
                        seen.insert(dep_path.clone());
                        if let Ok(source) = std::fs::read_to_string(&dep_path) {
                            if let Ok(_next) =
                                find_outbound_deps(&dep_path, &source, root, &file_index, cache)
                            {
                                // We don't add second-level deps to outbound to keep it clean;
                                // just resolve prototypes for the first level
                            }
                        }
                    }
                }
            }
        }

        if direction == ImpactDirection::In || direction == ImpactDirection::Both {
            inbound = find_inbound_deps(target, root, &file_index, cache)?;

            if depth >= 2 {
                let mut seen = HashSet::new();
                for dep in &inbound {
                    if let Some(ref path_str) = dep.path {
                        let dep_path = PathBuf::from(path_str);
                        if seen.contains(&dep_path) {
                            continue;
                        }
                        seen.insert(dep_path.clone());
                        // Find what imports this inbound file (one more hop)
                        if let Ok(_next) = find_inbound_deps(&dep_path, root, &file_index, cache) {
                            // Not adding to keep result focused
                        }
                    }
                }
            }
        }

        results.push(ImpactResult {
            target: target_str,
            depth,
            outbound,
            inbound,
        });
    }

    Ok(results)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImpactDirection {
    In,
    Out,
    Both,
}

impl std::str::FromStr for ImpactDirection {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "in" => Ok(ImpactDirection::In),
            "out" => Ok(ImpactDirection::Out),
            "both" => Ok(ImpactDirection::Both),
            _ => Err(format!("Unknown direction: {}", s)),
        }
    }
}

fn find_outbound_deps(
    target: &Path,
    source: &str,
    _root: &Path,
    _file_index: &HashMap<PathBuf, String>,
    cache: &AstCache,
) -> anyhow::Result<Vec<ImpactDep>> {
    let imports = extract_imports(target, source, cache)?;
    let mut deps = Vec::new();
    let mut seen = HashSet::new();

    for imp in imports {
        let key = format!("{}:{:?}", imp.name, imp.resolved_path);
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);

        let (resolved, path_str, prototypes) = if let Some(ref resolved_path) = imp.resolved_path {
            if resolved_path.exists() {
                let protos = extract_prototypes_from_file(resolved_path, cache)?;
                (
                    true,
                    Some(resolved_path.to_string_lossy().to_string()),
                    protos,
                )
            } else {
                (false, None, Vec::new())
            }
        } else {
            (false, None, Vec::new())
        };

        deps.push(ImpactDep {
            path: path_str,
            resolved,
            name: imp.name,
            symbols_used: Vec::new(),
            at_lines: vec![imp.line_number],
            prototypes,
        });
    }

    Ok(deps)
}

fn find_inbound_deps(
    target: &Path,
    _root: &Path,
    file_index: &HashMap<PathBuf, String>,
    cache: &AstCache,
) -> anyhow::Result<Vec<ImpactDep>> {
    let mut deps = Vec::new();
    let target_canonical = target
        .canonicalize()
        .unwrap_or_else(|_| target.to_path_buf());

    for (file_path, source) in file_index {
        if file_path == &target_canonical {
            continue;
        }

        let imports = extract_imports(file_path, source, cache)?;
        let mut used_symbols = Vec::new();
        let mut used_lines = Vec::new();

        for imp in imports {
            if let Some(ref resolved) = imp.resolved_path {
                let resolved_canonical =
                    resolved.canonicalize().unwrap_or_else(|_| resolved.clone());
                if resolved_canonical == target_canonical {
                    used_symbols.push(imp.name.clone());
                    used_lines.push(imp.line_number);
                }
            }
        }

        if !used_symbols.is_empty() {
            deps.push(ImpactDep {
                path: Some(file_path.to_string_lossy().to_string()),
                resolved: true,
                name: target
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                symbols_used: used_symbols,
                at_lines: used_lines,
                prototypes: Vec::new(),
            });
        }
    }

    Ok(deps)
}

/// Extract imports from a source file.
///
/// AST-based, via a per-language tree-sitter query. The previous line-scanning
/// implementation had two silent failure modes: it located JS/TS specifiers with
/// `rfind('"')`, so a single-quoted codebase produced zero imports, and it
/// required `import` and `from` on one line, so multi-line import blocks were
/// skipped entirely. Both produced an empty result rather than an error.
fn extract_imports(path: &Path, source: &str, cache: &AstCache) -> anyhow::Result<Vec<ImportRef>> {
    let Some(provider) = detect_language(path) else {
        return Ok(Vec::new());
    };
    let Some(query) = queries::import_query(provider.name) else {
        return Ok(Vec::new());
    };

    let tree = parse_cached(path, source, &provider, cache)?;
    let raw = queries::find_imports_via_query(&tree, source, query);

    Ok(raw
        .into_iter()
        .map(|item| ImportRef {
            resolved_path: resolve_import_specifier(provider.name, path, &item.specifier),
            name: item.specifier,
            line_number: item.line,
        })
        .collect())
}

/// Parse with the session AST cache, keyed on mtime.
///
/// Import extraction now needs a tree, and `find_inbound_deps` calls it once per
/// file per target, so caching keeps the constant factor down. Falls back to a
/// direct parse when file metadata is unavailable.
fn parse_cached(
    path: &Path,
    source: &str,
    provider: &LanguageProvider,
    cache: &AstCache,
) -> anyhow::Result<tree_sitter::Tree> {
    let Some(mtime) = std::fs::metadata(path).and_then(|m| m.modified()).ok() else {
        return parse_source(source, (provider.grammar)());
    };
    let key = path.to_path_buf();
    if let Some(tree) = cache.get(&key, mtime) {
        return Ok(tree);
    }
    let tree = parse_source(source, (provider.grammar)())?;
    cache.insert(key, mtime, tree.clone());
    Ok(tree)
}

/// Resolve an import specifier to a file on disk.
///
/// Returns `None` for external packages and anything otherwise unresolvable,
/// which callers record as an unresolved dependency rather than an error.
pub fn resolve_import_specifier(language: &str, path: &Path, specifier: &str) -> Option<PathBuf> {
    match language {
        "rust" => resolve_rust_use(path, specifier)
            .or_else(|| resolve_rust_super(path, specifier))
            .or_else(|| resolve_rust_mod(path, specifier)),
        "javascript" | "typescript" => resolve_relative_path(path, specifier),
        "python" => {
            let head = specifier
                .trim_start_matches('.')
                .split('.')
                .next()
                .unwrap_or(specifier);
            resolve_python_relative(path, specifier).or_else(|| resolve_python_relative(path, head))
        }
        "java" => resolve_java_class(path, specifier),
        _ => None,
    }
}

/// `super::foo::Bar` resolves relative to the declaring file's own module.
///
/// Each leading `super::` climbs one module level, which is one directory for a
/// `mod.rs` and the containing directory for a plain `foo.rs`. Very common in
/// Rust and previously unresolved, so sibling-module dependencies were invisible.
fn resolve_rust_super(current_file: &Path, use_path: &str) -> Option<PathBuf> {
    if !use_path.starts_with("super::") {
        return None;
    }
    let path_part = use_path.split('{').next().unwrap_or(use_path);
    let mut segments: Vec<&str> = path_part
        .split("::")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();

    // The first `super::` lands on the directory the declaring file sits in,
    // which is the parent module for both `foo.rs` and `foo/mod.rs`. Only the
    // second and later `super::` climb further.
    let mut dir = current_file.parent()?.to_path_buf();
    while segments.first() == Some(&"super") {
        segments.remove(0);
        // Only climb for the SECOND and later `super::`; the first one already
        // lands on the directory the declaring file sits in.
        if segments.first() == Some(&"super") {
            dir = dir.parent()?.to_path_buf();
        }
    }
    if segments.is_empty() {
        return None;
    }

    for take in (1..=segments.len()).rev() {
        let mut candidate = dir.clone();
        for part in &segments[..take] {
            candidate = candidate.join(part);
        }
        let as_file = candidate.with_extension("rs");
        if as_file.is_file() {
            return Some(as_file);
        }
        let as_mod = candidate.join("mod.rs");
        if as_mod.is_file() {
            return Some(as_mod);
        }
    }
    None
}

/// `mod foo;` resolves to `foo.rs` or `foo/mod.rs` beside the declaring file.
fn resolve_rust_mod(current: &Path, name: &str) -> Option<PathBuf> {
    if name.contains("::") {
        return None;
    }
    let dir = current.parent().unwrap_or(Path::new("."));
    let as_file = dir.join(format!("{name}.rs"));
    if as_file.exists() {
        return Some(as_file);
    }
    let as_dir = dir.join(name).join("mod.rs");
    as_dir.exists().then_some(as_dir)
}

/// Nearest ancestor directory of `from` that contains `marker`.
///
/// Anchors resolution on the declaring file rather than the process working
/// directory. Both Rust `crate::` and Java package paths are relative to a source
/// root, not to wherever `fdx` happens to be invoked from.
fn ancestor_containing(from: &Path, marker: &str) -> Option<PathBuf> {
    let mut dir = from.parent()?;
    loop {
        if dir.join(marker).exists() {
            return Some(dir.to_path_buf());
        }
        dir = dir.parent()?;
    }
}

/// `com.example.Fee` maps to `<source-root>/com/example/Fee.java`.
///
/// The source root is located by walking up from the declaring file, so this
/// works for a Maven layout at any depth and in a multi-module repository.
fn resolve_java_class(current: &Path, class_path: &str) -> Option<PathBuf> {
    let parts: Vec<&str> = class_path.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    // Maven and Gradle both use src/main/java; fall back to a bare src/.
    let root = ancestor_containing(current, "src/main/java")
        .map(|base| base.join("src/main/java"))
        .or_else(|| ancestor_containing(current, "src").map(|base| base.join("src")))?;

    let mut file_path = root;
    for part in &parts[..parts.len() - 1] {
        file_path = file_path.join(part);
    }
    file_path = file_path.join(format!("{}.java", parts.last()?));
    file_path.exists().then_some(file_path)
}

/// `crate::a::b::c` maps to `<crate-root>/src/a/b/c.rs` (or `.../c/mod.rs`).
///
/// The crate root is the nearest ancestor of the declaring file containing
/// `Cargo.toml`, NOT the process working directory. Anchoring on the CWD meant
/// `PathBuf::from("src")` never existed in a workspace layout like
/// `crates/fdx/src/...`, so every `use crate::...` silently resolved to nothing
/// and Rust import edges came only from `mod x;` declarations.
fn resolve_rust_use(current_file: &Path, use_path: &str) -> Option<PathBuf> {
    let rest = use_path.strip_prefix("crate::")?;

    // A braced use-list arrives as one specifier, e.g.
    // `crate::reader::code::{cache::AstCache, Symbol}`. Only the path before the
    // brace is a module path; the contents are items in several submodules.
    let path_part = rest.split('{').next().unwrap_or(rest);
    let parts: Vec<&str> = path_part
        .split("::")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        return None;
    }

    let src = ancestor_containing(current_file, "Cargo.toml")?.join("src");

    // Deepest module wins. Try the longest prefix first and shorten: for
    // `crate::a::b::Item` prefer `a/b.rs` over `a.rs`, because the deeper file is
    // the one that actually defines the imported item. Searching shallow-first
    // would stop at `a/mod.rs` whenever an intermediate module file exists.
    for take in (1..=parts.len()).rev() {
        let mut candidate = src.clone();
        for part in &parts[..take] {
            candidate = candidate.join(part);
        }
        let as_file = candidate.with_extension("rs");
        if as_file.is_file() {
            return Some(as_file);
        }
        let as_mod = candidate.join("mod.rs");
        if as_mod.is_file() {
            return Some(as_mod);
        }
    }

    None
}

fn resolve_python_relative(path: &Path, module: &str) -> Option<PathBuf> {
    let dir = path.parent().unwrap_or(Path::new("."));
    // Try module.py
    let py_file = dir.join(format!("{}.py", module.trim_start_matches('.')));
    if py_file.exists() {
        return Some(py_file);
    }
    // Try module/__init__.py
    let pkg_dir = dir.join(module.trim_start_matches('.')).join("__init__.py");
    if pkg_dir.exists() {
        return Some(pkg_dir);
    }
    None
}

fn resolve_relative_path(current: &Path, import_path: &str) -> Option<PathBuf> {
    let dir = current.parent().unwrap_or(Path::new("."));
    let resolved = dir.join(import_path);

    // Try exact path
    if resolved.exists() {
        return Some(resolved);
    }
    // Try with .js, .ts, .jsx, .tsx extensions
    for ext in &[".ts", ".tsx", ".js", ".jsx"] {
        let with_ext = resolved.with_extension(&ext[1..]);
        if with_ext.exists() {
            return Some(with_ext);
        }
    }
    // Try index file in directory
    for ext in &["ts", "tsx", "js", "jsx"] {
        let index_file = resolved.join(format!("index.{}", ext));
        if index_file.exists() {
            return Some(index_file);
        }
    }

    None
}

fn collect_code_files(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    if root.is_file() {
        files.push(root.to_path_buf());
        return Ok(files);
    }

    let walker = WalkBuilder::new(root)
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

    Ok(files)
}

fn extract_prototypes_from_file(path: &Path, cache: &AstCache) -> anyhow::Result<Vec<Symbol>> {
    let source = std::fs::read_to_string(path)?;
    let provider = detect_language(path).ok_or_else(|| anyhow::anyhow!("Unsupported language"))?;

    let tree = {
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
    reader.extract_prototypes(path, &source, &tree)
}
