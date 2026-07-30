//! `fdx graph build` — incremental, deletion-aware graph construction.
//!
//! ```text
//!   load graph.json ──(unusable)──► Graph::empty()   cache semantics: a stale,
//!        │                                           corrupt, or foreign graph
//!        │ usable                                    is simply a cold cache
//!        ▼
//!   WalkBuilder (gitignore-aware, `ignore` crate)
//!        │  one file at a time, never a full source map
//!        ▼
//!   sha256(contents) == file_hashes[path] ──yes──► skip
//!        │ no / new
//!        ▼
//!   symbol query ──► Node + Contains edges
//!   import query ──► Imports edges
//!   call query   ──► PendingCall (NOT resolved yet)
//!        │
//!        ▼
//!   STALE PHASE: files in file_hashes but gone from disk ──► drop_files
//!        │
//!        ▼
//!   GLOBAL RE-RESOLVE every pending call ──► Calls edges + confidence
//!        │
//!        ▼
//!   write .tmp in the SAME dir ──► rename (atomic)
//! ```

use super::resolve;
use super::types::{
    BuildWarning, CallShape, Confidence, Edge, EdgeKind, Graph, Node, NodeKind, PendingCall,
    WarningKind,
};
use crate::paths;
use crate::reader::code::{
    languages::detect_language,
    parser::parse_source,
    prototype::PrototypeReader,
    queries::{self, RawCallShape},
    Symbol,
};
use ignore::WalkBuilder;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Outcome of a build, for reporting and for tests.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuildStats {
    pub nodes: usize,
    pub edges: usize,
    pub files_parsed: usize,
    pub files_skipped: usize,
    pub files_removed: usize,
    pub warnings: usize,
    pub graph_path: PathBuf,
    /// True when a worktree seeded its first build from the main checkout's graph.
    pub warm_started: bool,
    /// False when nothing changed, so the existing file was left untouched.
    pub wrote: bool,
}

/// SHA-256 of file contents, hex encoded.
///
/// Content hashing rather than mtime because `git checkout` rewrites mtimes,
/// which would invalidate the whole cache on every branch switch.
fn hash_contents(source: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(source.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Load a usable graph, else `None`.
///
/// Any failure (missing, unreadable, malformed, wrong schema, different
/// repository) is treated identically: there is no usable cache.
fn load_usable(path: &Path, canonical_root: &str) -> Option<Graph> {
    let raw = std::fs::read_to_string(path).ok()?;
    let graph: Graph = serde_json::from_str(&raw).ok()?;
    graph.is_usable_for(canonical_root).then_some(graph)
}

/// Read a graph for a read-only command, with a rebuild hint on failure.
pub fn load_for_read(path: &Path, canonical_root: &str) -> Result<Graph, String> {
    if !path.exists() {
        return Err(format!(
            "No graph at {}. Run `fdx graph build` first.",
            path.display()
        ));
    }
    load_usable(path, canonical_root).ok_or_else(|| {
        format!(
            "Graph at {} is stale or unreadable (schema or repository mismatch). \
             Run `fdx graph build` to rebuild.",
            path.display()
        )
    })
}

/// Container frame while walking a file's flat, source-ordered symbol list.
struct Frame {
    id: String,
    end_line: usize,
}

/// Assign a stable, collision-free id to each symbol in one file.
///
/// Ids are `<file>::<container-path>::<name>`, with a `#<n>` suffix in source
/// order when the same name repeats in the same container. That suffix is what
/// stops Java overloads and Rust inherent-vs-trait `impl` methods from silently
/// overwriting one another.
fn assign_ids(rel_path: &str, symbols: &[Symbol]) -> Vec<(String, NodeKind, Symbol)> {
    let mut stack: Vec<Frame> = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut out = Vec::new();

    for symbol in symbols {
        while stack
            .last()
            .is_some_and(|frame| symbol.line_start > frame.end_line)
        {
            stack.pop();
        }

        let Some(kind) = NodeKind::from_symbol_kind(&symbol.kind) else {
            continue;
        };

        let container = stack
            .last()
            .map(|f| f.id.clone())
            .unwrap_or_else(|| rel_path.to_string());
        let base = format!("{container}::{}", symbol.name);
        let count = seen.entry(base.clone()).or_insert(0);
        *count += 1;
        let id = if *count == 1 {
            base.clone()
        } else {
            format!("{base}#{count}")
        };

        // Class-like and impl symbols can contain others.
        if matches!(
            kind,
            NodeKind::Class
                | NodeKind::Struct
                | NodeKind::Trait
                | NodeKind::Interface
                | NodeKind::Enum
                | NodeKind::Impl
                | NodeKind::Module
        ) {
            stack.push(Frame {
                id: id.clone(),
                end_line: symbol.line_end,
            });
        }

        out.push((id, kind, symbol.clone()));
    }

    out
}

/// The innermost symbol whose line range contains `line`.
fn enclosing_symbol(placed: &[(String, NodeKind, Symbol)], line: usize) -> Option<&str> {
    placed
        .iter()
        .filter(|(_, _, s)| s.line_start <= line && line <= s.line_end)
        .min_by_key(|(_, _, s)| s.line_end - s.line_start)
        .map(|(id, _, _)| id.as_str())
}

fn shape_of(raw: RawCallShape) -> CallShape {
    match raw {
        RawCallShape::Unqualified => CallShape::Unqualified,
        RawCallShape::Qualified => CallShape::Qualified,
        RawCallShape::Constructor => CallShape::Constructor,
        RawCallShape::PathScoped => CallShape::PathScoped,
    }
}

/// Everything extracted from a single file.
struct FileData {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    pending: Vec<PendingCall>,
    warning: Option<BuildWarning>,
}

/// Extract nodes, containment/import edges, and pending calls from one file.
fn extract_file(abs_path: &Path, rel_path: &str, source: &str, root: &Path) -> FileData {
    let mut data = FileData {
        nodes: Vec::new(),
        edges: Vec::new(),
        pending: Vec::new(),
        warning: None,
    };

    // The file itself is always a node, so an unparseable file still appears.
    data.nodes.push(Node {
        id: rel_path.to_string(),
        kind: NodeKind::File,
        file: rel_path.to_string(),
        line: None,
        name: abs_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(rel_path)
            .to_string(),
    });

    let Some(provider) = detect_language(abs_path) else {
        data.warning = Some(BuildWarning {
            file: rel_path.to_string(),
            kind: WarningKind::UnsupportedLanguage,
            detail: "no tree-sitter grammar for this extension".to_string(),
        });
        return data;
    };

    let tree = match parse_source(source, (provider.grammar)()) {
        Ok(tree) => tree,
        Err(e) => {
            data.warning = Some(BuildWarning {
                file: rel_path.to_string(),
                kind: WarningKind::ParseError,
                detail: e.to_string(),
            });
            return data;
        }
    };

    // Symbols and containment.
    let symbols = PrototypeReader::new()
        .extract_prototypes(abs_path, source, &tree)
        .unwrap_or_default();
    let placed = assign_ids(rel_path, &symbols);

    for (id, kind, symbol) in &placed {
        data.nodes.push(Node {
            id: id.clone(),
            kind: *kind,
            file: rel_path.to_string(),
            line: Some(symbol.line_start as u32),
            name: symbol.name.clone(),
        });
        // `Contains` is kept because `graph path` needs it to hop from a file
        // node into a symbol; parent is otherwise derivable from the id.
        let parent = id
            .rsplit_once("::")
            .map(|(container, _)| container.to_string())
            .unwrap_or_else(|| rel_path.to_string());
        data.edges.push(Edge {
            from: parent,
            to: id.clone(),
            kind: EdgeKind::Contains,
            confidence: Confidence::High,
        });
    }

    // Imports, as file-to-file edges.
    if let Some(query) = queries::import_query(provider.name) {
        for raw in queries::find_imports_via_query(&tree, source, query) {
            let resolved = crate::reader::impact::resolve_import_specifier(
                provider.name,
                abs_path,
                &raw.specifier,
            );
            if let Some(target) = resolved.and_then(|t| relative_to(&t, root)) {
                data.edges.push(Edge {
                    from: rel_path.to_string(),
                    to: target,
                    kind: EdgeKind::Imports,
                    confidence: Confidence::High,
                });
            }
        }
    }

    // Calls, left unresolved until the global pass.
    if let Some(query) = queries::call_query(provider.name) {
        for raw in queries::find_calls_via_query(&tree, source, query) {
            let from = enclosing_symbol(&placed, raw.line)
                .map(|s| s.to_string())
                .unwrap_or_else(|| rel_path.to_string());
            data.pending.push(PendingCall {
                from,
                callee_name: raw.callee_name,
                shape: shape_of(raw.shape),
                line: raw.line as u32,
                qualifier: raw.qualifier,
            });
        }
    }

    data
}

/// Path relative to `root`, forward-slashed, or `None` if outside the tree.
fn relative_to(path: &Path, root: &Path) -> Option<String> {
    let canonical = path.canonicalize().ok()?;
    let rel = canonical.strip_prefix(root).ok()?;
    Some(rel.to_string_lossy().replace('\\', "/"))
}

/// Build or refresh the graph for the repository containing `start`.
pub fn build(home: &Path, start: &Path) -> anyhow::Result<BuildStats> {
    let identity = paths::resolve_repo_identity(start)
        .ok_or_else(|| anyhow::anyhow!("{} is not inside a git repository", start.display()))?;
    let root = identity.canonical_root.clone();
    let canonical_root = root.to_string_lossy().to_string();
    let graph_path = paths::graph_path(home, &identity);

    // Warm start: a worktree's first build seeds from the main checkout's graph
    // so it only re-parses what the wave actually changed.
    let mut warm_started = false;
    let mut loaded_in_place = false;
    let mut graph = match load_usable(&graph_path, &canonical_root) {
        Some(existing) => {
            loaded_in_place = true;
            existing
        }
        None => {
            let parent = paths::parent_graph_path(home, &identity);
            match (identity.worktree.is_some(), load_usable(&parent, &canonical_root)) {
                (true, Some(seed)) => {
                    warm_started = true;
                    seed
                }
                _ => Graph::empty(&identity.slug, &canonical_root, now_iso8601()),
            }
        }
    };

    let mut files_parsed = 0usize;
    let mut files_skipped = 0usize;
    let mut seen_files: HashSet<String> = HashSet::new();

    for entry in WalkBuilder::new(&root).hidden(false).git_ignore(true).build() {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let abs = entry.path();
        if detect_language(abs).is_none() {
            continue;
        }
        let Some(rel) = relative_to(abs, &root) else {
            continue;
        };
        seen_files.insert(rel.clone());

        // Read one file at a time; never hold the whole repository in memory.
        let Ok(source) = std::fs::read_to_string(abs) else {
            graph.warnings.push(BuildWarning {
                file: rel.clone(),
                kind: WarningKind::Unreadable,
                detail: "file could not be read as UTF-8".to_string(),
            });
            continue;
        };

        let hash = hash_contents(&source);
        if graph.file_hashes.get(&rel) == Some(&hash) {
            files_skipped += 1;
            continue;
        }

        // Replace this file's prior contribution before adding the new one.
        graph.drop_files([rel.as_str()]);

        let data = extract_file(abs, &rel, &source, &root);
        graph.nodes.extend(data.nodes);
        graph.edges.extend(data.edges);
        if !data.pending.is_empty() {
            graph.pending_calls.insert(rel.clone(), data.pending);
        }
        if let Some(warning) = data.warning {
            graph.warnings.push(warning);
        }
        graph.file_hashes.insert(rel, hash);
        files_parsed += 1;
    }

    // Stale phase: hashing changed files never notices a DELETED file, so its
    // nodes would linger as ghosts that `query` and `report` still surface.
    let removed: Vec<String> = graph
        .file_hashes
        .keys()
        .filter(|path| !seen_files.contains(*path))
        .cloned()
        .collect();
    let files_removed = removed.len();
    graph.drop_files(&removed);

    resolve::resolve_all(&mut graph);

    // A no-op build must not rewrite the file. Otherwise `built_at` alone makes
    // every run produce different bytes, so "0 files parsed" cannot be verified
    // as "nothing changed", and readers see a new mtime for identical content.
    let changed = files_parsed > 0 || files_removed > 0 || warm_started || !loaded_in_place;
    if changed {
        graph.built_at = now_iso8601();
        write_atomic(&graph_path, &graph)?;
    }

    Ok(BuildStats {
        nodes: graph.nodes.len(),
        edges: graph.edges.len(),
        files_parsed,
        files_skipped,
        files_removed,
        warnings: graph.warnings.len(),
        graph_path,
        warm_started,
        wrote: changed,
    })
}

/// Serialize to a `.tmp` beside the target, then rename.
///
/// Same-directory rename is atomic, so a reader never observes a partial file.
/// An orphan `.tmp` from a crashed build is removed first rather than inherited.
fn write_atomic(path: &Path, graph: &Graph) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, serde_json::to_vec_pretty(graph)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// ISO 8601 UTC timestamp. Mirrors `commands::context` to avoid a `chrono` dep.
fn now_iso8601() -> String {
    crate::commands::context::iso8601_now()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sym(kind: &str, name: &str, start: usize, end: usize) -> Symbol {
        Symbol {
            kind: kind.to_string(),
            name: name.to_string(),
            signature: String::new(),
            doc_comment: None,
            line_start: start,
            line_end: end,
            body: None,
        }
    }

    #[test]
    fn ids_nest_through_containers() {
        let symbols = vec![
            sym("class", "Svc", 1, 10),
            sym("method", "render", 2, 4),
            sym("function", "free", 12, 14),
        ];
        let placed = assign_ids("a.ts", &symbols);
        let ids: Vec<&str> = placed.iter().map(|(id, _, _)| id.as_str()).collect();
        assert_eq!(ids, vec!["a.ts::Svc", "a.ts::Svc::render", "a.ts::free"]);
    }

    /// Java overloads and Rust inherent-vs-trait methods collide on name+container.
    #[test]
    fn repeated_names_get_an_occurrence_suffix() {
        let symbols = vec![
            sym("class", "Svc", 1, 20),
            sym("method", "render", 2, 4),
            sym("method", "render", 6, 8),
        ];
        let placed = assign_ids("Svc.java", &symbols);
        let ids: Vec<&str> = placed.iter().map(|(id, _, _)| id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["Svc.java::Svc", "Svc.java::Svc::render", "Svc.java::Svc::render#2"],
            "a repeated name must not overwrite the first node"
        );
    }

    #[test]
    fn container_closes_when_a_symbol_starts_past_its_end() {
        let symbols = vec![
            sym("class", "A", 1, 5),
            sym("method", "inside", 2, 3),
            sym("class", "B", 7, 12),
            sym("method", "other", 8, 9),
        ];
        let placed = assign_ids("x.ts", &symbols);
        let ids: Vec<&str> = placed.iter().map(|(id, _, _)| id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["x.ts::A", "x.ts::A::inside", "x.ts::B", "x.ts::B::other"]
        );
    }

    #[test]
    fn enclosing_symbol_picks_the_innermost() {
        let symbols = vec![sym("class", "Svc", 1, 10), sym("method", "render", 2, 6)];
        let placed = assign_ids("a.ts", &symbols);
        assert_eq!(enclosing_symbol(&placed, 3), Some("a.ts::Svc::render"));
        assert_eq!(enclosing_symbol(&placed, 8), Some("a.ts::Svc"));
        assert_eq!(enclosing_symbol(&placed, 20), None);
    }

    #[test]
    fn hashing_is_content_based_and_stable() {
        assert_eq!(hash_contents("abc"), hash_contents("abc"));
        assert_ne!(hash_contents("abc"), hash_contents("abd"));
        assert_eq!(hash_contents("abc").len(), 64);
    }
}
