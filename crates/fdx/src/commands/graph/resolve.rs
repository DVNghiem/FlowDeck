//! Call resolution: turn `PendingCall`s into `Edge`s with honest confidence.
//!
//! Confidence tracks what the call **syntax** proves, not merely a name match.
//! A qualified call `x.foo()` can never be `High`, because nothing in the syntax
//! identifies the receiver's type. Resolving purely on name would connect
//! `foo()` to every same-named method in the file, including unrelated classes,
//! which is exactly the ambiguity the node-id scheme exists to expose.
//!
//! ```text
//!   call site
//!       │
//!       ├─ foo()            unqualified
//!       │     ├─ same file, same name ──────────────────► High
//!       │     ├─ else a directly imported file ─────────► High
//!       │     └─ else globally unique name ────────────► Medium
//!       │
//!       ├─ x.foo()          qualified  (receiver type UNKNOWN)
//!       │     └─ any callable named foo ───────────────► Medium   never High
//!       │
//!       ├─ new Foo()        constructor
//!       │     └─ class-like named Foo ─────────────────► High
//!       │
//!       └─ Foo::bar()       path-scoped  (container NAMED)
//!             ├─ method inside container Foo ──────────► High
//!             ├─ else callable in module Foo ──────────► High
//!             └─ else ──────────────────────────────────► no edge
//!                    (an unknown qualifier means external:
//!                     `Path::new` must NOT match every `new`)
//!
//!   then, for whichever candidate set was chosen:
//!       1 candidate      ──► the confidence above
//!       2..=5 candidates ──► one Low edge each
//!       >5 candidates    ──► no edge   (keeps get/map/push out of the graph)
//! ```

use super::types::{CallShape, Confidence, Edge, EdgeKind, Graph, Node};
use std::collections::{HashMap, HashSet};

/// Above this many candidates a call resolves to nothing.
///
/// This is what keeps `get`, `map`, `push`, and `new` from wiring every
/// same-named symbol together and dominating the god-node ranking.
pub const MAX_CALL_CANDIDATES: usize = 5;

/// Lookup tables built once per resolution pass.
struct Index<'g> {
    callable_by_name: HashMap<&'g str, Vec<&'g Node>>,
    typelike_by_name: HashMap<&'g str, Vec<&'g Node>>,
    callable_by_file: HashMap<&'g str, Vec<&'g Node>>,
    /// Container name (last id segment before the symbol) to its methods.
    method_by_container: HashMap<String, Vec<&'g Node>>,
    /// Module name (a file's stem) to the callables it defines.
    ///
    /// Lets `paths::resolve_repo_identity()` resolve through the module segment,
    /// while `Path::new()` finds no module named `Path` and stays unresolved.
    callable_by_module: HashMap<String, Vec<&'g Node>>,
}

/// A file's module name, i.e. its stem: `crates/fdx/src/paths.rs` to `paths`.
fn module_name_of(file: &str) -> Option<&str> {
    let base = file.rsplit('/').next()?;
    let stem = base.split('.').next()?;
    (!stem.is_empty()).then_some(stem)
}

impl<'g> Index<'g> {
    fn build(graph: &'g Graph) -> Self {
        let mut callable_by_name: HashMap<&str, Vec<&Node>> = HashMap::new();
        let mut typelike_by_name: HashMap<&str, Vec<&Node>> = HashMap::new();
        let mut callable_by_file: HashMap<&str, Vec<&Node>> = HashMap::new();
        let mut method_by_container: HashMap<String, Vec<&Node>> = HashMap::new();
        let mut callable_by_module: HashMap<String, Vec<&Node>> = HashMap::new();

        for node in &graph.nodes {
            if node.kind.is_callable() {
                callable_by_name
                    .entry(node.name.as_str())
                    .or_default()
                    .push(node);
                callable_by_file
                    .entry(node.file.as_str())
                    .or_default()
                    .push(node);
                if let Some(module) = module_name_of(&node.file) {
                    callable_by_module
                        .entry(module.to_string())
                        .or_default()
                        .push(node);
                }
                if let Some(parent) = node.parent_id() {
                    // Container's bare name is its last `::` segment.
                    let container = parent.rsplit("::").next().unwrap_or(parent).to_string();
                    method_by_container.entry(container).or_default().push(node);
                }
            } else if !matches!(node.kind, super::types::NodeKind::File) {
                typelike_by_name
                    .entry(node.name.as_str())
                    .or_default()
                    .push(node);
            }
        }

        Self {
            callable_by_name,
            typelike_by_name,
            callable_by_file,
            method_by_container,
            callable_by_module,
        }
    }
}

/// Files each file imports, from the graph's existing `Imports` edges.
fn import_map(graph: &Graph) -> HashMap<&str, HashSet<&str>> {
    let mut map: HashMap<&str, HashSet<&str>> = HashMap::new();
    for edge in &graph.edges {
        if edge.kind == EdgeKind::Imports {
            map.entry(edge.from.as_str())
                .or_default()
                .insert(edge.to.as_str());
        }
    }
    map
}

/// Emit edges for one candidate set at a stated maximum confidence.
///
/// A unique match takes `max`; 2..=MAX_CALL_CANDIDATES each get `Low`; more than
/// that resolves to nothing.
fn edges_for(from: &str, candidates: &[&Node], max: Confidence) -> Vec<Edge> {
    match candidates.len() {
        0 => Vec::new(),
        1 => vec![Edge {
            from: from.to_string(),
            to: candidates[0].id.clone(),
            kind: EdgeKind::Calls,
            confidence: max,
        }],
        n if n <= MAX_CALL_CANDIDATES => candidates
            .iter()
            .map(|c| Edge {
                from: from.to_string(),
                to: c.id.clone(),
                kind: EdgeKind::Calls,
                confidence: Confidence::Low,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Re-resolve every pending call in the graph, replacing all `Calls` edges.
///
/// Runs on **every** build, not just for changed files. Incremental hashing means
/// an unchanged caller is never re-parsed, so if its callee moved to another file
/// only a global pass notices.
pub fn resolve_all(graph: &mut Graph) {
    graph.edges.retain(|e| e.kind != EdgeKind::Calls);

    let pending = std::mem::take(&mut graph.pending_calls);
    let mut new_edges = Vec::new();

    {
        let index = Index::build(graph);
        let imports = import_map(graph);

        for (file, calls) in &pending {
            for call in calls {
                let name = call.callee_name.as_str();

                let edges = match call.shape {
                    // A bare call must be in scope: same file first, then a
                    // directly imported file, then a globally unique match.
                    CallShape::Unqualified => {
                        let same_file: Vec<&Node> = index
                            .callable_by_file
                            .get(file.as_str())
                            .map(|ns| ns.iter().copied().filter(|n| n.name == name).collect())
                            .unwrap_or_default();
                        if !same_file.is_empty() {
                            edges_for(&call.from, &same_file, Confidence::High)
                        } else {
                            let imported: Vec<&Node> = imports
                                .get(file.as_str())
                                .map(|files| {
                                    files
                                        .iter()
                                        .filter_map(|f| index.callable_by_file.get(*f))
                                        .flat_map(|ns| ns.iter().copied())
                                        .filter(|n| n.name == name)
                                        .collect()
                                })
                                .unwrap_or_default();
                            if !imported.is_empty() {
                                edges_for(&call.from, &imported, Confidence::High)
                            } else {
                                let global = index
                                    .callable_by_name
                                    .get(name)
                                    .cloned()
                                    .unwrap_or_default();
                                edges_for(&call.from, &global, Confidence::Medium)
                            }
                        }
                    }

                    // Receiver type is unknown, so this caps at Medium forever.
                    CallShape::Qualified => {
                        let candidates = index
                            .callable_by_name
                            .get(name)
                            .cloned()
                            .unwrap_or_default();
                        edges_for(&call.from, &candidates, Confidence::Medium)
                    }

                    CallShape::Constructor => {
                        let candidates = index
                            .typelike_by_name
                            .get(name)
                            .cloned()
                            .unwrap_or_default();
                        edges_for(&call.from, &candidates, Confidence::High)
                    }

                    // `Foo::bar()` names its container explicitly, so resolution
                    // stays inside that container or that module. There is NO
                    // bare-name fallback: `Path::new()` names a std type absent
                    // from the graph, and falling back would wire it to every
                    // unrelated `new` in the repo. An unknown qualifier means the
                    // callee is external, which is correctly no edge at all.
                    CallShape::PathScoped => {
                        let qualifier = call.qualifier.as_deref().unwrap_or_default();
                        // Take only the final segment: `std::fs::read_to_string`
                        // qualifies on `fs`, not on `std::fs`.
                        let qualifier = qualifier.rsplit("::").next().unwrap_or(qualifier);

                        let in_container: Vec<&Node> = index
                            .method_by_container
                            .get(qualifier)
                            .map(|ns| ns.iter().copied().filter(|n| n.name == name).collect())
                            .unwrap_or_default();
                        if !in_container.is_empty() {
                            edges_for(&call.from, &in_container, Confidence::High)
                        } else {
                            let in_module: Vec<&Node> = index
                                .callable_by_module
                                .get(qualifier)
                                .map(|ns| ns.iter().copied().filter(|n| n.name == name).collect())
                                .unwrap_or_default();
                            edges_for(&call.from, &in_module, Confidence::High)
                        }
                    }
                };

                new_edges.extend(edges);
            }
        }
    }

    // Drop self-edges: a recursive call adds no structural information.
    new_edges.retain(|e| e.from != e.to);
    graph.edges.extend(new_edges);
    graph.pending_calls = pending;
}

#[cfg(test)]
mod tests {
    use super::super::types::{Graph, NodeKind, PendingCall};
    use super::*;

    fn graph_with(nodes: Vec<Node>) -> Graph {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = nodes;
        g
    }

    fn node(id: &str, kind: NodeKind, file: &str, name: &str) -> Node {
        Node {
            id: id.to_string(),
            kind,
            file: file.to_string(),
            line: Some(1),
            name: name.to_string(),
        }
    }

    fn pending(from: &str, name: &str, shape: CallShape, qualifier: Option<&str>) -> PendingCall {
        PendingCall {
            from: from.to_string(),
            callee_name: name.to_string(),
            shape,
            line: 1,
            qualifier: qualifier.map(|q| q.to_string()),
        }
    }

    #[test]
    fn unqualified_same_file_call_is_high_confidence() {
        let mut g = graph_with(vec![
            node("a.ts::caller", NodeKind::Function, "a.ts", "caller"),
            node("a.ts::target", NodeKind::Function, "a.ts", "target"),
        ]);
        g.pending_calls.insert(
            "a.ts".to_string(),
            vec![pending(
                "a.ts::caller",
                "target",
                CallShape::Unqualified,
                None,
            )],
        );
        resolve_all(&mut g);

        let calls: Vec<&Edge> = g
            .edges
            .iter()
            .filter(|e| e.kind == EdgeKind::Calls)
            .collect();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].to, "a.ts::target");
        assert_eq!(calls[0].confidence, Confidence::High);
    }

    /// The load-bearing rule: a receiver call cannot earn High confidence even
    /// when the name resolves uniquely, because the receiver's type is unknown.
    #[test]
    fn qualified_call_never_reaches_high_confidence() {
        let mut g = graph_with(vec![
            node("a.ts::caller", NodeKind::Function, "a.ts", "caller"),
            node("a.ts::Svc::render", NodeKind::Method, "a.ts", "render"),
        ]);
        g.pending_calls.insert(
            "a.ts".to_string(),
            vec![pending(
                "a.ts::caller",
                "render",
                CallShape::Qualified,
                None,
            )],
        );
        resolve_all(&mut g);

        let calls: Vec<&Edge> = g
            .edges
            .iter()
            .filter(|e| e.kind == EdgeKind::Calls)
            .collect();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].confidence, Confidence::Medium);
        assert!(calls[0].confidence < Confidence::High);
    }

    /// Two classes in one file both defining `render` must not both be High.
    #[test]
    fn ambiguous_same_file_candidates_are_low_confidence() {
        let mut g = graph_with(vec![
            node("a.ts::caller", NodeKind::Function, "a.ts", "caller"),
            node("a.ts::UserSvc::render", NodeKind::Method, "a.ts", "render"),
            node("a.ts::AdminSvc::render", NodeKind::Method, "a.ts", "render"),
        ]);
        g.pending_calls.insert(
            "a.ts".to_string(),
            vec![pending(
                "a.ts::caller",
                "render",
                CallShape::Unqualified,
                None,
            )],
        );
        resolve_all(&mut g);

        let calls: Vec<&Edge> = g
            .edges
            .iter()
            .filter(|e| e.kind == EdgeKind::Calls)
            .collect();
        assert_eq!(calls.len(), 2, "both candidates should be recorded");
        assert!(
            calls.iter().all(|e| e.confidence == Confidence::Low),
            "ambiguous resolution must be Low, got {calls:?}"
        );
    }

    /// A very common name resolves to nothing rather than fanning out.
    #[test]
    fn calls_past_the_candidate_ceiling_resolve_to_nothing() {
        let mut nodes = vec![node("a.ts::caller", NodeKind::Function, "a.ts", "caller")];
        for i in 0..(MAX_CALL_CANDIDATES + 1) {
            nodes.push(node(
                &format!("f{i}.ts::C::get"),
                NodeKind::Method,
                &format!("f{i}.ts"),
                "get",
            ));
        }
        let mut g = graph_with(nodes);
        g.pending_calls.insert(
            "a.ts".to_string(),
            vec![pending("a.ts::caller", "get", CallShape::Qualified, None)],
        );
        resolve_all(&mut g);

        assert!(
            g.edges.iter().all(|e| e.kind != EdgeKind::Calls),
            "a name with too many candidates must produce no edge"
        );
    }

    #[test]
    fn path_scoped_call_uses_its_qualifier() {
        let mut g = graph_with(vec![
            node("a.rs::caller", NodeKind::Function, "a.rs", "caller"),
            node("a.rs::Foo::make", NodeKind::Method, "a.rs", "make"),
            node("a.rs::Bar::make", NodeKind::Method, "a.rs", "make"),
        ]);
        g.pending_calls.insert(
            "a.rs".to_string(),
            vec![pending(
                "a.rs::caller",
                "make",
                CallShape::PathScoped,
                Some("Foo"),
            )],
        );
        resolve_all(&mut g);

        let calls: Vec<&Edge> = g
            .edges
            .iter()
            .filter(|e| e.kind == EdgeKind::Calls)
            .collect();
        assert_eq!(calls.len(), 1, "qualifier should disambiguate");
        assert_eq!(calls[0].to, "a.rs::Foo::make");
        assert_eq!(calls[0].confidence, Confidence::High);
    }

    /// `Path::new()` names a std type that is not in the graph. Falling back to a
    /// bare-name lookup wired it to every unrelated `new` method in the repo,
    /// which is how three bogus callees showed up on `resolve_repo_identity`.
    #[test]
    fn path_scoped_call_to_an_unknown_qualifier_resolves_to_nothing() {
        let mut g = graph_with(vec![
            node("a.rs::caller", NodeKind::Function, "a.rs", "caller"),
            node(
                "cache.rs::AstCache::new",
                NodeKind::Method,
                "cache.rs",
                "new",
            ),
            node(
                "deep.rs::DeepReader::new",
                NodeKind::Method,
                "deep.rs",
                "new",
            ),
        ]);
        g.pending_calls.insert(
            "a.rs".to_string(),
            vec![pending(
                "a.rs::caller",
                "new",
                CallShape::PathScoped,
                Some("Path"),
            )],
        );
        resolve_all(&mut g);
        assert!(
            g.edges.iter().all(|e| e.kind != EdgeKind::Calls),
            "an external qualifier must produce no edge, got {:?}",
            g.edges
        );
    }

    /// A module-qualified call still resolves, which is why the fix cannot simply
    /// drop every unknown qualifier without checking module names.
    #[test]
    fn path_scoped_call_resolves_through_a_module_name() {
        let mut g = graph_with(vec![
            node("build.rs::run", NodeKind::Function, "build.rs", "run"),
            node(
                "src/paths.rs::resolve_repo_identity",
                NodeKind::Function,
                "src/paths.rs",
                "resolve_repo_identity",
            ),
        ]);
        g.pending_calls.insert(
            "build.rs".to_string(),
            vec![pending(
                "build.rs::run",
                "resolve_repo_identity",
                CallShape::PathScoped,
                Some("paths"),
            )],
        );
        resolve_all(&mut g);
        let calls: Vec<&Edge> = g
            .edges
            .iter()
            .filter(|e| e.kind == EdgeKind::Calls)
            .collect();
        assert_eq!(calls.len(), 1, "module-qualified call should resolve");
        assert_eq!(calls[0].to, "src/paths.rs::resolve_repo_identity");
        assert_eq!(calls[0].confidence, Confidence::High);
    }

    /// `std::fs::read_to_string` qualifies on `fs`, not on the whole path.
    #[test]
    fn multi_segment_qualifier_uses_its_final_segment() {
        let mut g = graph_with(vec![
            node("a.rs::caller", NodeKind::Function, "a.rs", "caller"),
            node(
                "src/fs.rs::helper",
                NodeKind::Function,
                "src/fs.rs",
                "helper",
            ),
        ]);
        g.pending_calls.insert(
            "a.rs".to_string(),
            vec![pending(
                "a.rs::caller",
                "helper",
                CallShape::PathScoped,
                Some("crate::fs"),
            )],
        );
        resolve_all(&mut g);
        assert_eq!(
            g.edges
                .iter()
                .find(|e| e.kind == EdgeKind::Calls)
                .map(|e| e.to.as_str()),
            Some("src/fs.rs::helper")
        );
    }

    #[test]
    fn recursive_self_calls_are_dropped() {
        let mut g = graph_with(vec![node(
            "a.ts::loop_fn",
            NodeKind::Function,
            "a.ts",
            "loop_fn",
        )]);
        g.pending_calls.insert(
            "a.ts".to_string(),
            vec![pending(
                "a.ts::loop_fn",
                "loop_fn",
                CallShape::Unqualified,
                None,
            )],
        );
        resolve_all(&mut g);
        assert!(g.edges.iter().all(|e| e.kind != EdgeKind::Calls));
    }

    /// Re-resolution must be idempotent and must not accumulate duplicates.
    #[test]
    fn resolving_twice_does_not_duplicate_edges() {
        let mut g = graph_with(vec![
            node("a.ts::caller", NodeKind::Function, "a.ts", "caller"),
            node("a.ts::target", NodeKind::Function, "a.ts", "target"),
        ]);
        g.pending_calls.insert(
            "a.ts".to_string(),
            vec![pending(
                "a.ts::caller",
                "target",
                CallShape::Unqualified,
                None,
            )],
        );
        resolve_all(&mut g);
        let first = g.edges.len();
        resolve_all(&mut g);
        assert_eq!(g.edges.len(), first, "re-resolution must be idempotent");
    }

    /// The soundness case for persisting pending calls: when a callee moves to a
    /// new file, a global re-resolve must repoint the edge even though the caller
    /// was never re-parsed.
    #[test]
    fn a_moved_callee_gets_repointed_on_reresolve() {
        let mut g = graph_with(vec![
            node("b.ts::caller", NodeKind::Function, "b.ts", "caller"),
            node("a.ts::moved", NodeKind::Function, "a.ts", "moved"),
        ]);
        g.edges.push(Edge {
            from: "b.ts".to_string(),
            to: "a.ts".to_string(),
            kind: EdgeKind::Imports,
            confidence: Confidence::High,
        });
        g.pending_calls.insert(
            "b.ts".to_string(),
            vec![pending(
                "b.ts::caller",
                "moved",
                CallShape::Unqualified,
                None,
            )],
        );
        resolve_all(&mut g);
        assert_eq!(
            g.edges
                .iter()
                .find(|e| e.kind == EdgeKind::Calls)
                .map(|e| e.to.as_str()),
            Some("a.ts::moved")
        );

        // `moved` relocates to c.ts. The caller is untouched.
        g.drop_files(["a.ts"]);
        g.nodes
            .push(node("c.ts::moved", NodeKind::Function, "c.ts", "moved"));
        g.edges.push(Edge {
            from: "b.ts".to_string(),
            to: "c.ts".to_string(),
            kind: EdgeKind::Imports,
            confidence: Confidence::High,
        });
        resolve_all(&mut g);

        let call = g
            .edges
            .iter()
            .find(|e| e.kind == EdgeKind::Calls)
            .expect("edge must be re-resolved, not dangling");
        assert_eq!(call.to, "c.ts::moved");
    }
}
