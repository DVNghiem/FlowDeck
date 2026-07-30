//! Graph data model.
//!
//! `graph.json` is a **cache** over fdx's own readers, not a source of truth. Any
//! load failure (version skew, corruption, truncation, missing field) is treated
//! as a cold cache: `build` rebuilds silently, read commands print a rebuild hint.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Schema version. Bump on any change to the serialized shape.
///
/// Readers compare this and treat a mismatch as a cold cache rather than
/// attempting migration, because rebuilding is cheap and always correct.
pub const SCHEMA_VERSION: u8 = 1;

/// What a node is.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    File,
    Function,
    Method,
    Class,
    Struct,
    Trait,
    Interface,
    Enum,
    Module,
    Constant,
    Impl,
}

impl NodeKind {
    /// Map an extractor kind string (`Symbol::kind`) onto a node kind.
    ///
    /// Returns `None` for kinds that are not worth graphing as their own node.
    pub fn from_symbol_kind(kind: &str) -> Option<Self> {
        match kind {
            "function" => Some(Self::Function),
            "method" => Some(Self::Method),
            "class" => Some(Self::Class),
            "struct" => Some(Self::Struct),
            "trait" => Some(Self::Trait),
            "interface" => Some(Self::Interface),
            "enum" => Some(Self::Enum),
            "module" => Some(Self::Module),
            "const" | "static" => Some(Self::Constant),
            "impl" => Some(Self::Impl),
            _ => None,
        }
    }

    /// Short label for text output.
    pub fn label(&self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Function => "fn",
            Self::Method => "method",
            Self::Class => "class",
            Self::Struct => "struct",
            Self::Trait => "trait",
            Self::Interface => "interface",
            Self::Enum => "enum",
            Self::Module => "module",
            Self::Constant => "const",
            Self::Impl => "impl",
        }
    }

    /// Whether this kind can be the target of a call edge.
    pub fn is_callable(&self) -> bool {
        matches!(self, Self::Function | Self::Method)
    }
}

/// A symbol or file in the graph.
///
/// `id` is `<file>::<container-path>::<name>` with a `#<n>` suffix when the same
/// name+container repeats in one file. That suffix is what keeps Java overloads
/// and Rust inherent-vs-trait `impl` methods from silently overwriting each other.
/// The parent container is derivable from `id`, so it is not stored.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    /// Path relative to the repository root.
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    pub name: String,
}

impl Node {
    /// Id of the enclosing symbol, derived from `id`.
    ///
    /// Returns `None` for a file node or a top-level symbol, whose only container
    /// is the file itself.
    pub fn parent_id(&self) -> Option<&str> {
        let without_occurrence = self
            .id
            .rsplit_once('#')
            .map_or(self.id.as_str(), |(l, _)| l);
        let (container, _) = without_occurrence.rsplit_once("::")?;
        // A single `::` means the container IS the file; that is `file`, not a parent.
        container.contains("::").then_some(container)
    }
}

/// How much a `Calls` edge can be trusted.
///
/// Tracks what the call **syntax** proves, not merely a name match. A qualified
/// call like `x.foo()` can never be `High`, because nothing in the syntax
/// identifies the receiver's type.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    Low,
    Medium,
    High,
}

impl Confidence {
    /// Suffix marker for text output. Shared so the renderers cannot disagree.
    pub fn marker(&self) -> &'static str {
        match self {
            Self::High => "",
            Self::Medium => " ~",
            Self::Low => " ?",
        }
    }

    /// One-line legend explaining the markers, for the foot of any text output.
    pub fn legend() -> &'static str {
        "Confidence: unmarked = high, ~ = medium (receiver type unknown), ? = ambiguous"
    }
}

/// What an edge means.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    Calls,
    Imports,
    Implements,
    Extends,
    /// File contains symbol, or symbol contains nested symbol.
    ///
    /// Kept even though `Node::file` and `Node::parent_id` overlap with it,
    /// because `graph path` needs it to hop from a file node to a symbol.
    Contains,
}

/// A directed relationship between two nodes.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    pub confidence: Confidence,
}

/// The syntactic shape of a call site, which bounds how confidently it can resolve.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CallShape {
    /// `foo()` — a free function or an imported name.
    Unqualified,
    /// `x.foo()` — receiver type unknown, so never `High`.
    Qualified,
    /// `new Foo()` — resolves against class-like nodes.
    Constructor,
    /// `Foo::bar()` — container named explicitly.
    PathScoped,
}

/// An unresolved call, persisted so every build can re-resolve globally.
///
/// Without this, incremental builds are unsound: if `B` calls `foo` and `foo`
/// moves from `A` to `C`, `B` is unchanged, so its edge would never be revisited
/// and would keep pointing at a node that no longer exists.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PendingCall {
    /// Node id of the caller.
    pub from: String,
    pub callee_name: String,
    pub shape: CallShape,
    pub line: u32,
    /// Container name for `PathScoped` calls, e.g. `Foo` in `Foo::bar()`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qualifier: Option<String>,
}

/// Why a file produced no or partial data.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WarningKind {
    ParseError,
    UnsupportedLanguage,
    DuplicateId,
    Unreadable,
}

/// A machine-readable build warning.
///
/// "Log a warning and continue" is not consumable by an agent or a test, so
/// warnings are part of the serialized output rather than stderr noise.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BuildWarning {
    pub file: String,
    pub kind: WarningKind,
    pub detail: String,
}

/// The whole cache.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Graph {
    pub version: u8,
    /// ISO 8601 UTC timestamp of the last build.
    pub built_at: String,
    /// Project slug, for display.
    pub project: String,
    /// Absolute canonical repository root.
    ///
    /// Validated on load: two unrelated checkouts that share a basename would
    /// otherwise load each other's graph and pass the version check.
    pub canonical_root: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    /// Relative path to SHA-256 of contents, for incremental rebuilds.
    pub file_hashes: HashMap<String, String>,
    /// Relative path to that file's unresolved calls.
    pub pending_calls: HashMap<String, Vec<PendingCall>>,
    pub warnings: Vec<BuildWarning>,
}

impl Graph {
    /// An empty graph for `root`, used for a cold build.
    pub fn empty(project: &str, canonical_root: &str, built_at: String) -> Self {
        Self {
            version: SCHEMA_VERSION,
            built_at,
            project: project.to_string(),
            canonical_root: canonical_root.to_string(),
            nodes: Vec::new(),
            edges: Vec::new(),
            file_hashes: HashMap::new(),
            pending_calls: HashMap::new(),
            warnings: Vec::new(),
        }
    }

    /// Whether this graph is usable for `canonical_root` at the current schema.
    pub fn is_usable_for(&self, canonical_root: &str) -> bool {
        self.version == SCHEMA_VERSION && self.canonical_root == canonical_root
    }

    /// Remove every node, edge, hash, and pending call belonging to `files`.
    ///
    /// Required for correctness on deletion: hashing only changed files never
    /// notices that a file is gone, so its nodes would linger as unreachable
    /// ghosts that `query` and `report` still report.
    pub fn drop_files<I, S>(&mut self, files: I)
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let gone: std::collections::HashSet<String> =
            files.into_iter().map(|f| f.as_ref().to_string()).collect();
        if gone.is_empty() {
            return;
        }

        let dropped_ids: std::collections::HashSet<String> = self
            .nodes
            .iter()
            .filter(|n| gone.contains(&n.file))
            .map(|n| n.id.clone())
            .collect();

        self.nodes.retain(|n| !gone.contains(&n.file));
        self.edges
            .retain(|e| !dropped_ids.contains(&e.from) && !dropped_ids.contains(&e.to));
        self.file_hashes.retain(|path, _| !gone.contains(path));
        self.pending_calls.retain(|path, _| !gone.contains(path));
        self.warnings.retain(|w| !gone.contains(&w.file));
    }

    /// Node lookup by id.
    pub fn node(&self, id: &str) -> Option<&Node> {
        self.nodes.iter().find(|n| n.id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, kind: NodeKind, file: &str, name: &str) -> Node {
        Node {
            id: id.to_string(),
            kind,
            file: file.to_string(),
            line: Some(1),
            name: name.to_string(),
        }
    }

    #[test]
    fn parent_id_is_derived_from_the_id() {
        let method = node(
            "src/svc.ts::UserSvc::render",
            NodeKind::Method,
            "src/svc.ts",
            "render",
        );
        assert_eq!(method.parent_id(), Some("src/svc.ts::UserSvc"));
    }

    #[test]
    fn parent_id_ignores_the_occurrence_suffix() {
        let overload = node(
            "src/Svc.java::Svc::render#2",
            NodeKind::Method,
            "src/Svc.java",
            "render",
        );
        assert_eq!(overload.parent_id(), Some("src/Svc.java::Svc"));
    }

    #[test]
    fn top_level_symbols_have_no_parent() {
        let free = node(
            "src/lib.rs::helper",
            NodeKind::Function,
            "src/lib.rs",
            "helper",
        );
        assert_eq!(free.parent_id(), None);
        let file = node("src/lib.rs", NodeKind::File, "src/lib.rs", "lib.rs");
        assert_eq!(file.parent_id(), None);
    }

    #[test]
    fn a_graph_from_another_repo_is_not_usable() {
        let g = Graph::empty("api", "/repos/alpha/api", "now".to_string());
        assert!(g.is_usable_for("/repos/alpha/api"));
        // Same basename, different repository — the exact cross-load this guards.
        assert!(!g.is_usable_for("/repos/beta/api"));
    }

    #[test]
    fn a_stale_schema_version_is_not_usable() {
        let mut g = Graph::empty("api", "/repos/api", "now".to_string());
        g.version = SCHEMA_VERSION.wrapping_sub(1);
        assert!(!g.is_usable_for("/repos/api"));
    }

    #[test]
    fn dropping_a_file_removes_its_nodes_edges_hashes_and_pending() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes.push(node("a.ts", NodeKind::File, "a.ts", "a.ts"));
        g.nodes
            .push(node("a.ts::gone", NodeKind::Function, "a.ts", "gone"));
        g.nodes.push(node("b.ts", NodeKind::File, "b.ts", "b.ts"));
        g.nodes
            .push(node("b.ts::stays", NodeKind::Function, "b.ts", "stays"));
        g.edges.push(Edge {
            from: "b.ts::stays".to_string(),
            to: "a.ts::gone".to_string(),
            kind: EdgeKind::Calls,
            confidence: Confidence::High,
        });
        g.file_hashes.insert("a.ts".to_string(), "h1".to_string());
        g.file_hashes.insert("b.ts".to_string(), "h2".to_string());
        g.pending_calls.insert("a.ts".to_string(), Vec::new());
        g.warnings.push(BuildWarning {
            file: "a.ts".to_string(),
            kind: WarningKind::ParseError,
            detail: "x".to_string(),
        });

        g.drop_files(["a.ts"]);

        assert_eq!(g.nodes.len(), 2, "only b.ts nodes should remain");
        assert!(g.nodes.iter().all(|n| n.file == "b.ts"));
        assert!(
            g.edges.is_empty(),
            "edges touching a dropped node must go too, or they dangle"
        );
        assert!(!g.file_hashes.contains_key("a.ts"));
        assert!(!g.pending_calls.contains_key("a.ts"));
        assert!(g.warnings.is_empty());
    }

    #[test]
    fn dropping_nothing_is_a_noop() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes.push(node("a.ts", NodeKind::File, "a.ts", "a.ts"));
        g.drop_files(Vec::<String>::new());
        assert_eq!(g.nodes.len(), 1);
    }

    #[test]
    fn round_trips_through_json() {
        let mut g = Graph::empty("p", "/repos/p", "2026-01-01T00:00:00.000Z".to_string());
        g.nodes
            .push(node("a.ts::f", NodeKind::Function, "a.ts", "f"));
        g.pending_calls.insert(
            "a.ts".to_string(),
            vec![PendingCall {
                from: "a.ts::f".to_string(),
                callee_name: "g".to_string(),
                shape: CallShape::Unqualified,
                line: 3,
                qualifier: None,
            }],
        );
        let json = serde_json::to_string(&g).expect("must serialize");
        let back: Graph = serde_json::from_str(&json).expect("must deserialize");
        assert_eq!(back.nodes, g.nodes);
        assert_eq!(back.pending_calls, g.pending_calls);
        assert_eq!(back.canonical_root, "/repos/p");
    }
}
