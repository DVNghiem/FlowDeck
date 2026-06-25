use crate::reader::code::{
    cache::AstCache,
    languages::detect_language,
    parser::parse_source,
    prototype::PrototypeReader,
    Symbol,
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
                            if let Ok(_next) = find_outbound_deps(&dep_path, &source, root, &file_index, cache) {
                                // We don't add second-level deps to outbound to keep it clean;
                                // just resolve prototypes for the first level
                            }
                        }
                    }
                }
            }
        }

        if direction == ImpactDirection::In || direction == ImpactDirection::Both {
            inbound = find_inbound_deps(target, root, &file_index)?;

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
                        if let Ok(_next) = find_inbound_deps(&dep_path, root, &file_index) {
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
    let imports = extract_imports(target, source)?;
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
                (true, Some(resolved_path.to_string_lossy().to_string()), protos)
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
) -> anyhow::Result<Vec<ImpactDep>> {
    let mut deps = Vec::new();
    let target_canonical = target.canonicalize().unwrap_or_else(|_| target.to_path_buf());

    for (file_path, source) in file_index {
        if file_path == &target_canonical {
            continue;
        }

        let imports = extract_imports(file_path, source)?;
        let mut used_symbols = Vec::new();
        let mut used_lines = Vec::new();

        for imp in imports {
            if let Some(ref resolved) = imp.resolved_path {
                let resolved_canonical = resolved.canonicalize().unwrap_or_else(|_| resolved.clone());
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
                name: target.file_stem().unwrap_or_default().to_string_lossy().to_string(),
                symbols_used: used_symbols,
                at_lines: used_lines,
                prototypes: Vec::new(),
            });
        }
    }

    Ok(deps)
}

/// Extract imports from a source file. Best-effort per language.
fn extract_imports(path: &Path, source: &str) -> anyhow::Result<Vec<ImportRef>> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    match ext {
        "rs" => extract_rust_imports(path, source),
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => extract_js_imports(path, source),
        "py" => extract_python_imports(path, source),
        "java" => extract_java_imports(path, source),
        _ => Ok(Vec::new()),
    }
}

fn extract_rust_imports(path: &Path, source: &str) -> anyhow::Result<Vec<ImportRef>> {
    let mut imports = Vec::new();
    let lines: Vec<&str> = source.lines().collect();

    for (idx, line) in lines.iter().enumerate() {
        let line_number = idx + 1;
        let trimmed = line.trim();

        if trimmed.starts_with("use ") {
            // e.g. use crate::payment::fee::Fee;
            if let Some(rest) = trimmed.strip_prefix("use ") {
                let path_part = rest.trim_end_matches(';').trim();
                // Try to resolve crate::... to a file path
                if let Some(resolved) = resolve_rust_use(path, path_part) {
                    imports.push(ImportRef {
                        name: path_part.to_string(),
                        resolved_path: Some(resolved),
                        line_number,
                    });
                } else {
                    imports.push(ImportRef {
                        name: path_part.to_string(),
                        resolved_path: None,
                        line_number,
                    });
                }
            }
        } else if trimmed.starts_with("mod ") {
            // e.g. mod fee;
            if let Some(rest) = trimmed.strip_prefix("mod ") {
                let mod_name = rest.trim_end_matches(';').trim();
                let mod_path = path.parent().unwrap_or(Path::new(".")).join(format!("{}.rs", mod_name));
                let mod_dir_path = path.parent().unwrap_or(Path::new(".")).join(mod_name).join("mod.rs");

                let resolved = if mod_path.exists() {
                    Some(mod_path)
                } else if mod_dir_path.exists() {
                    Some(mod_dir_path)
                } else {
                    None
                };

                imports.push(ImportRef {
                    name: mod_name.to_string(),
                    resolved_path: resolved,
                    line_number,
                });
            }
        }
    }

    Ok(imports)
}

fn resolve_rust_use(_current_file: &Path, use_path: &str) -> Option<PathBuf> {
    // Heuristic: crate::a::b::c -> src/a/b/c.rs
    if let Some(rest) = use_path.strip_prefix("crate::") {
        let parts: Vec<&str> = rest.split("::").collect();
        if parts.is_empty() {
            return None;
        }

        // Try as file: src/a/b.rs
        let mut file_path = PathBuf::from("src");
        for (i, part) in parts.iter().enumerate() {
            if i == parts.len() - 1 {
                // Last part could be a module or a symbol
                let with_rs = file_path.join(format!("{}.rs", part));
                if with_rs.exists() {
                    return Some(with_rs);
                }
                // Try as mod.rs in directory
                let as_dir = file_path.join(part).join("mod.rs");
                if as_dir.exists() {
                    return Some(as_dir);
                }
            } else {
                file_path = file_path.join(part);
            }
        }
    }

    None
}

fn extract_js_imports(path: &Path, source: &str) -> anyhow::Result<Vec<ImportRef>> {
    let mut imports = Vec::new();
    let lines: Vec<&str> = source.lines().collect();

    for (idx, line) in lines.iter().enumerate() {
        let line_number = idx + 1;
        let trimmed = line.trim();

        // import ... from './path'
        if trimmed.starts_with("import ") && trimmed.contains(" from ") {
            if let Some(start) = trimmed.rfind('"') {
                if let Some(end) = trimmed[..start].rfind('"') {
                    let import_path = &trimmed[end + 1..start];
                    let resolved = resolve_relative_path(path, import_path);
                    imports.push(ImportRef {
                        name: import_path.to_string(),
                        resolved_path: resolved,
                        line_number,
                    });
                }
            }
        }
        // require('./path')
        else if trimmed.contains("require(") {
            if let Some(start) = trimmed.find("require(") {
                let after = &trimmed[start + 8..];
                if let Some(end) = after.find(')') {
                    let inner = &after[..end];
                    let clean = inner.trim().trim_matches('"').trim_matches('\'');
                    if clean.starts_with(".") {
                        let resolved = resolve_relative_path(path, clean);
                        imports.push(ImportRef {
                            name: clean.to_string(),
                            resolved_path: resolved,
                            line_number,
                        });
                    }
                }
            }
        }
    }

    Ok(imports)
}

fn extract_python_imports(path: &Path, source: &str) -> anyhow::Result<Vec<ImportRef>> {
    let mut imports = Vec::new();
    let lines: Vec<&str> = source.lines().collect();

    for (idx, line) in lines.iter().enumerate() {
        let line_number = idx + 1;
        let trimmed = line.trim();

        // from .module import X
        if trimmed.starts_with("from ") {
            if let Some(rest) = trimmed.strip_prefix("from ") {
                let parts: Vec<&str> = rest.split(" import ").collect();
                if !parts.is_empty() {
                    let module = parts[0].trim();
                    if module.starts_with('.') {
                        let resolved = resolve_python_relative(path, module);
                        imports.push(ImportRef {
                            name: module.to_string(),
                            resolved_path: resolved,
                            line_number,
                        });
                    } else {
                        imports.push(ImportRef {
                            name: module.to_string(),
                            resolved_path: None,
                            line_number,
                        });
                    }
                }
            }
        }
        // import module
        else if trimmed.starts_with("import ") {
            let module = trimmed.strip_prefix("import ").unwrap_or("").trim();
            let top_module = module.split('.').next().unwrap_or(module);
            let resolved = resolve_python_relative(path, top_module);
            imports.push(ImportRef {
                name: module.to_string(),
                resolved_path: resolved,
                line_number,
            });
        }
    }

    Ok(imports)
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

fn extract_java_imports(_path: &Path, source: &str) -> anyhow::Result<Vec<ImportRef>> {
    let mut imports = Vec::new();
    let lines: Vec<&str> = source.lines().collect();

    for (idx, line) in lines.iter().enumerate() {
        let line_number = idx + 1;
        let trimmed = line.trim();

        if trimmed.starts_with("import ") {
            let class_path = trimmed.strip_prefix("import ").unwrap_or("").trim_end_matches(';').trim();
            // Map com.example.Fee -> src/main/java/com/example/Fee.java
            let parts: Vec<&str> = class_path.split('.').collect();
            if parts.len() >= 2 {
                let mut file_path = PathBuf::from("src/main/java");
                for part in &parts[..parts.len() - 1] {
                    file_path = file_path.join(part);
                }
                file_path = file_path.join(format!("{}.java", parts.last().unwrap()));
                if file_path.exists() {
                    imports.push(ImportRef {
                        name: class_path.to_string(),
                        resolved_path: Some(file_path),
                        line_number,
                    });
                } else {
                    imports.push(ImportRef {
                        name: class_path.to_string(),
                        resolved_path: None,
                        line_number,
                    });
                }
            }
        }
    }

    Ok(imports)
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
    let provider = detect_language(path)
        .ok_or_else(|| anyhow::anyhow!("Unsupported language"))?;

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
