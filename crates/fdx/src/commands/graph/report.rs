//! `fdx graph report` — write `GRAPH_REPORT.md`, a session-start orientation file.
//!
//! Ranking uses **High-confidence Calls and Imports edges only**. Two exclusions
//! matter:
//!
//! - `Contains` is excluded. Every symbol has exactly one, so including it would
//!   rank files by size and call that "blast radius".
//! - Medium and Low `Calls` edges are excluded. A Medium edge is a
//!   receiver-qualified call whose receiver type is unknown, so ranking on it
//!   surfaces common method names (`get`, `map`, `push`) rather than architecture.
//!   That was the whole objection to bare-name resolution.
//!
//! The report records the `built_at` and content hash of the graph it came from,
//! because report generation is a separate step: without the stamp, session start
//! could read a report describing a graph that no longer exists.

use super::types::{Confidence, EdgeKind, Graph, Node};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

/// How many god nodes to list.
const GOD_NODE_COUNT: usize = 10;
/// How many clusters to describe in full.
const CLUSTER_COUNT: usize = 8;
/// How many orphans to list before truncating.
const ORPHAN_LIST_LIMIT: usize = 20;
/// How many import cycles to list.
const CYCLE_LIMIT: usize = 10;

/// Edges that carry architectural signal, as `(from, to)` id pairs.
///
/// Directed, deduped, and confidence-filtered.
fn signal_edges(graph: &Graph) -> Vec<(&str, &str)> {
    let mut seen: HashSet<(&str, &str)> = HashSet::new();
    let mut out = Vec::new();
    for edge in &graph.edges {
        let carries_signal = match edge.kind {
            EdgeKind::Calls => edge.confidence == Confidence::High,
            EdgeKind::Imports | EdgeKind::Implements | EdgeKind::Extends => true,
            EdgeKind::Contains => false,
        };
        if !carries_signal {
            continue;
        }
        let pair = (edge.from.as_str(), edge.to.as_str());
        if seen.insert(pair) {
            out.push(pair);
        }
    }
    out
}

/// One entry in the god-node table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GodNode {
    pub name: String,
    pub file: String,
    pub kind: String,
    pub callers: usize,
    pub callees: usize,
    pub degree: usize,
}

/// A connected component of the signal graph.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cluster {
    /// Highest-degree member, used as the cluster's name.
    pub core: String,
    pub size: usize,
    pub files: Vec<String>,
}

/// Everything the report renders.
#[derive(Debug, Clone)]
pub struct Report {
    pub nodes: usize,
    pub edges: usize,
    pub files: usize,
    pub god_nodes: Vec<GodNode>,
    pub clusters: Vec<Cluster>,
    pub cluster_total: usize,
    pub orphans: Vec<String>,
    pub orphan_total: usize,
    /// Non-callable nodes with no edges: expected, not a finding.
    pub orphan_structural: usize,
    pub cycles: Vec<Vec<String>>,
    pub source_built_at: String,
    pub source_hash: String,
    pub unresolved_calls: usize,
}

/// Rank nodes by in-plus-out degree over signal edges.
fn god_nodes(graph: &Graph, edges: &[(&str, &str)]) -> Vec<GodNode> {
    let mut incoming: HashMap<&str, usize> = HashMap::new();
    let mut outgoing: HashMap<&str, usize> = HashMap::new();
    for (from, to) in edges {
        *outgoing.entry(*from).or_insert(0) += 1;
        *incoming.entry(*to).or_insert(0) += 1;
    }

    let by_id: HashMap<&str, &Node> = graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    let mut ranked: Vec<GodNode> = by_id
        .values()
        // Files rank by import fan-in, which is a different question; god nodes
        // are about symbols.
        .filter(|node| node.kind != super::types::NodeKind::File)
        .map(|node| {
            let callers = incoming.get(node.id.as_str()).copied().unwrap_or(0);
            let callees = outgoing.get(node.id.as_str()).copied().unwrap_or(0);
            GodNode {
                name: node.name.clone(),
                file: node.file.clone(),
                kind: node.kind.label().to_string(),
                callers,
                callees,
                degree: callers + callees,
            }
        })
        .filter(|g| g.degree > 0)
        .collect();

    ranked.sort_by(|a, b| {
        b.degree
            .cmp(&a.degree)
            .then(b.callers.cmp(&a.callers))
            .then(a.file.cmp(&b.file))
            .then(a.name.cmp(&b.name))
    });
    ranked.truncate(GOD_NODE_COUNT);
    ranked
}

/// Connected components over signal edges, treated as undirected.
fn clusters(graph: &Graph, edges: &[(&str, &str)]) -> (Vec<Cluster>, usize) {
    let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut degree: HashMap<&str, usize> = HashMap::new();
    for (from, to) in edges {
        adjacency.entry(*from).or_default().push(*to);
        adjacency.entry(*to).or_default().push(*from);
        *degree.entry(*from).or_insert(0) += 1;
        *degree.entry(*to).or_insert(0) += 1;
    }

    let file_of: HashMap<&str, &str> = graph
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.file.as_str()))
        .collect();
    let name_of: HashMap<&str, &str> = graph
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.name.as_str()))
        .collect();

    let mut visited: HashSet<&str> = HashSet::new();
    let mut found: Vec<Cluster> = Vec::new();

    // BTreeMap ordering makes component discovery deterministic across runs.
    let starts: BTreeMap<&str, ()> = adjacency.keys().map(|k| (*k, ())).collect();

    for start in starts.keys() {
        if visited.contains(start) {
            continue;
        }
        let mut component: Vec<&str> = Vec::new();
        let mut queue: VecDeque<&str> = VecDeque::new();
        queue.push_back(start);
        visited.insert(start);

        while let Some(current) = queue.pop_front() {
            component.push(current);
            for neighbour in adjacency.get(current).into_iter().flatten() {
                if visited.insert(*neighbour) {
                    queue.push_back(*neighbour);
                }
            }
        }

        let core = component
            .iter()
            .max_by_key(|id| (degree.get(**id).copied().unwrap_or(0), std::cmp::Reverse(**id)))
            .map(|id| name_of.get(*id).copied().unwrap_or(*id).to_string())
            .unwrap_or_default();

        let mut files: Vec<String> = component
            .iter()
            .filter_map(|id| file_of.get(*id))
            .map(|f| f.to_string())
            .collect();
        files.sort();
        files.dedup();

        found.push(Cluster {
            core,
            size: component.len(),
            files,
        });
    }

    let total = found.len();
    found.sort_by(|a, b| b.size.cmp(&a.size).then(a.core.cmp(&b.core)));
    found.truncate(CLUSTER_COUNT);
    (found, total)
}

/// Callable nodes with no signal edges: a possible dead-code signal.
///
/// Restricted to functions and methods on purpose. Interfaces, type aliases,
/// constants, and enums have no call edges by construction, so listing them as
/// "orphans" is noise, not a finding. On this repo that distinction is the
/// difference between 501 entries and 206 actionable ones.
///
/// Returns `(sample, callable_total, structural_total)`.
fn orphans(graph: &Graph, edges: &[(&str, &str)]) -> (Vec<String>, usize, usize) {
    let connected: HashSet<&str> = edges
        .iter()
        .flat_map(|(from, to)| [*from, *to])
        .collect();

    let mut callable: Vec<String> = Vec::new();
    let mut structural = 0usize;

    for node in &graph.nodes {
        if node.kind == super::types::NodeKind::File || connected.contains(node.id.as_str()) {
            continue;
        }
        if node.kind.is_callable() {
            callable.push(format!("{} ({})", node.name, node.file));
        } else {
            structural += 1;
        }
    }

    callable.sort();
    let total = callable.len();
    callable.truncate(ORPHAN_LIST_LIMIT);
    (callable, total, structural)
}

/// File-level import cycles, found by DFS with an explicit path.
///
/// File-level rather than symbol-level because a circular *file* import is the
/// actionable finding; mutually recursive functions are normal.
fn import_cycles(graph: &Graph) -> Vec<Vec<String>> {
    let mut adjacency: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for edge in &graph.edges {
        if edge.kind == EdgeKind::Imports {
            adjacency
                .entry(edge.from.as_str())
                .or_default()
                .push(edge.to.as_str());
        }
    }
    for targets in adjacency.values_mut() {
        targets.sort();
        targets.dedup();
    }

    let mut cycles: Vec<Vec<String>> = Vec::new();
    let mut seen_signatures: HashSet<Vec<&str>> = HashSet::new();
    let mut fully_explored: HashSet<&str> = HashSet::new();

    for start in adjacency.keys().copied() {
        if fully_explored.contains(start) {
            continue;
        }
        // Iterative DFS carrying the current path.
        let mut stack: Vec<(&str, usize)> = vec![(start, 0)];
        let mut path: Vec<&str> = vec![start];
        let mut on_path: HashSet<&str> = [start].into_iter().collect();

        while let Some((node, index)) = stack.pop() {
            let neighbours = adjacency.get(node).map(|v| v.as_slice()).unwrap_or(&[]);
            if index >= neighbours.len() {
                on_path.remove(node);
                path.pop();
                fully_explored.insert(node);
                continue;
            }
            stack.push((node, index + 1));
            let next = neighbours[index];

            if on_path.contains(next) {
                // Found a cycle: the segment of `path` from `next` onward.
                if let Some(at) = path.iter().position(|p| *p == next) {
                    let mut signature: Vec<&str> = path[at..].to_vec();
                    signature.sort();
                    if seen_signatures.insert(signature) && cycles.len() < CYCLE_LIMIT {
                        let mut cycle: Vec<String> =
                            path[at..].iter().map(|p| p.to_string()).collect();
                        cycle.push(next.to_string());
                        cycles.push(cycle);
                    }
                }
                continue;
            }
            if fully_explored.contains(next) {
                continue;
            }
            path.push(next);
            on_path.insert(next);
            stack.push((next, 0));
        }
    }

    cycles
}

/// Analyze a graph.
///
/// `source_hash` is the content hash of the `graph.json` this came from, so the
/// report can be checked for staleness independently of the graph.
pub fn analyze(graph: &Graph, source_hash: &str) -> Report {
    let edges = signal_edges(graph);
    let (clusters, cluster_total) = clusters(graph, &edges);
    let (orphans, orphan_total, orphan_structural) = orphans(graph, &edges);

    let resolved_from: HashSet<&str> = graph
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Calls)
        .map(|e| e.from.as_str())
        .collect();
    let unresolved_calls = graph
        .pending_calls
        .values()
        .flatten()
        .filter(|p| !resolved_from.contains(p.from.as_str()))
        .count();

    Report {
        nodes: graph.nodes.len(),
        edges: graph.edges.len(),
        files: graph.file_hashes.len(),
        god_nodes: god_nodes(graph, &edges),
        clusters,
        cluster_total,
        orphans,
        orphan_total,
        orphan_structural,
        cycles: import_cycles(graph),
        source_built_at: graph.built_at.clone(),
        source_hash: source_hash.to_string(),
        unresolved_calls,
    }
}

/// Render the report as markdown.
pub fn render_markdown(report: &Report, generated_at: &str) -> String {
    let mut out = String::new();

    out.push_str("# Graph Report\n\n");
    out.push_str(&format!("Generated: {generated_at}\n"));
    out.push_str(&format!(
        "Source graph: built {} (content {})\n",
        report.source_built_at,
        report.source_hash.chars().take(12).collect::<String>()
    ));
    out.push_str(&format!(
        "Nodes: {} | Edges: {} | Files: {}\n\n",
        report.nodes, report.edges, report.files
    ));
    out.push_str(
        "> Staleness: this report describes the source graph stamped above. If\n\
         > `fdx graph build` has run since, rebuild the report before trusting it.\n\n\
         > Scope: rankings use high-confidence call and import edges only.\n\
         > Containment edges are excluded (every symbol has one). Receiver-qualified\n\
         > calls are excluded because the receiver's type is unknown, so a name like\n\
         > `get` cannot be attributed to a specific definition.\n\
         > Cross-language edges are NOT tracked: a TypeScript file invoking a Rust\n\
         > binary is invisible here, so a clean report is not a complete one.\n\n",
    );

    out.push_str("## God Nodes (highest blast radius)\n\n");
    if report.god_nodes.is_empty() {
        out.push_str("_No symbol has a high-confidence edge yet._\n\n");
    } else {
        out.push_str("| Symbol | Kind | File | Degree | Callers | Callees |\n");
        out.push_str("|--------|------|------|--------|---------|---------|\n");
        for god in &report.god_nodes {
            out.push_str(&format!(
                "| {} | {} | {} | {} | {} | {} |\n",
                god.name, god.kind, god.file, god.degree, god.callers, god.callees
            ));
        }
        out.push('\n');
    }

    out.push_str(&format!(
        "## Clusters ({} total, showing {})\n\n",
        report.cluster_total,
        report.clusters.len()
    ));
    for cluster in &report.clusters {
        out.push_str(&format!(
            "### {} ({} nodes)\n\n",
            cluster.core, cluster.size
        ));
        let shown: Vec<&String> = cluster.files.iter().take(10).collect();
        out.push_str(&format!(
            "Files: {}{}\n\n",
            shown
                .iter()
                .map(|f| f.as_str())
                .collect::<Vec<_>>()
                .join(", "),
            if cluster.files.len() > shown.len() {
                format!(" (+{} more)", cluster.files.len() - shown.len())
            } else {
                String::new()
            }
        ));
    }

    out.push_str("## Circular Imports\n\n");
    if report.cycles.is_empty() {
        out.push_str("_None detected._\n\n");
    } else {
        for cycle in &report.cycles {
            out.push_str(&format!("- {}\n", cycle.join(" -> ")));
        }
        out.push('\n');
    }

    out.push_str(&format!(
        "## Unreferenced Functions ({} total)\n\n\
         Functions and methods with no high-confidence caller. A possible dead-code\n\
         signal, but expect false positives: entry points, trait impls, test helpers,\n\
         and anything called only through a receiver-qualified call are all reachable\n\
         in reality. {} non-callable nodes (interfaces, types, constants, enums) also\n\
         have no edges, which is expected and not listed.\n\n",
        report.orphan_total, report.orphan_structural
    ));
    if report.orphans.is_empty() {
        out.push_str("_None._\n\n");
    } else {
        for orphan in &report.orphans {
            out.push_str(&format!("- {orphan}\n"));
        }
        if report.orphan_total > report.orphans.len() {
            out.push_str(&format!(
                "- _(+{} more not listed)_\n",
                report.orphan_total - report.orphans.len()
            ));
        }
        out.push('\n');
    }

    out.push_str(&format!(
        "## Unresolved Calls\n\n{} call site(s) resolved to no target. Expected for \
         standard-library and third-party calls, which are deliberately out of scope.\n",
        report.unresolved_calls
    ));

    out
}

/// Analyze the graph at `graph_path` and write `GRAPH_REPORT.md` beside it.
///
/// Returns the report path and a one-line summary for the CLI.
pub fn write_report(
    home: &std::path::Path,
    identity: &crate::paths::RepoIdentity,
    graph_path: &std::path::Path,
    canonical_root: &str,
) -> anyhow::Result<(std::path::PathBuf, String)> {
    let raw = std::fs::read_to_string(graph_path).map_err(|_| {
        anyhow::anyhow!(
            "No graph at {}. Run `fdx graph build` first.",
            graph_path.display()
        )
    })?;

    // Hash the bytes we actually read, so the stamp identifies this exact graph.
    let source_hash = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(raw.as_bytes());
        format!("{:x}", hasher.finalize())
    };

    let graph: Graph = serde_json::from_str(&raw).map_err(|_| {
        anyhow::anyhow!(
            "Graph at {} is unreadable. Run `fdx graph build` to rebuild.",
            graph_path.display()
        )
    })?;
    if !graph.is_usable_for(canonical_root) {
        anyhow::bail!(
            "Graph at {} belongs to a different repository or schema. Run `fdx graph build`.",
            graph_path.display()
        );
    }

    let report = analyze(&graph, &source_hash);
    let generated_at = crate::commands::context::iso8601_now();
    let markdown = render_markdown(&report, &generated_at);

    let report_path = crate::paths::graph_report_path(home, identity);
    if let Some(parent) = report_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Atomic, same-directory rename, matching how the graph itself is written.
    let tmp = report_path.with_extension("md.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(&tmp, markdown)?;
    std::fs::rename(&tmp, &report_path)?;

    let summary = format!(
        "Report: {} god nodes, {} clusters, {} cycles, {} orphans, {} unresolved calls",
        report.god_nodes.len(),
        report.cluster_total,
        report.cycles.len(),
        report.orphan_total,
        report.unresolved_calls
    );
    Ok((report_path, summary))
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::{Edge, NodeKind};

    fn node(id: &str, kind: NodeKind, file: &str, name: &str) -> Node {
        Node {
            id: id.to_string(),
            kind,
            file: file.to_string(),
            line: Some(1),
            name: name.to_string(),
        }
    }

    fn call(from: &str, to: &str, confidence: Confidence) -> Edge {
        Edge {
            from: from.to_string(),
            to: to.to_string(),
            kind: EdgeKind::Calls,
            confidence,
        }
    }

    fn imports(from: &str, to: &str) -> Edge {
        Edge {
            from: from.to_string(),
            to: to.to_string(),
            kind: EdgeKind::Imports,
            confidence: Confidence::High,
        }
    }

    /// The core objection to bare-name resolution: a common method name must not
    /// out-rank real architecture just because many callers share the name.
    #[test]
    fn low_confidence_edges_do_not_create_god_nodes() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![
            node("a.ts::popular", NodeKind::Method, "a.ts", "get"),
            node("a.ts::real", NodeKind::Function, "a.ts", "realCore"),
        ];
        for i in 0..30 {
            let caller = format!("c{i}.ts::fn");
            g.nodes
                .push(node(&caller, NodeKind::Function, &format!("c{i}.ts"), "fn"));
            // Many ambiguous callers of `get`...
            g.edges.push(call(&caller, "a.ts::popular", Confidence::Low));
        }
        // ...against a handful of certain callers of the real core.
        for i in 0..3 {
            g.edges
                .push(call(&format!("c{i}.ts::fn"), "a.ts::real", Confidence::High));
        }

        let report = analyze(&g, "hash");
        let top = &report.god_nodes[0];
        assert_eq!(
            top.name, "realCore",
            "high-confidence architecture must out-rank an ambiguous common name, got {:?}",
            report.god_nodes
        );
        assert!(
            !report.god_nodes.iter().any(|g| g.name == "get"),
            "`get` reached the table on Low edges alone: {:?}",
            report.god_nodes
        );
    }

    /// Containment is one edge per symbol, so including it would rank by file size.
    #[test]
    fn containment_edges_are_excluded_from_ranking() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![node("big.ts::Cls", NodeKind::Class, "big.ts", "Cls")];
        for i in 0..40 {
            let id = format!("big.ts::Cls::m{i}");
            g.nodes
                .push(node(&id, NodeKind::Method, "big.ts", &format!("m{i}")));
            g.edges.push(Edge {
                from: "big.ts::Cls".to_string(),
                to: id,
                kind: EdgeKind::Contains,
                confidence: Confidence::High,
            });
        }
        let report = analyze(&g, "hash");
        assert!(
            report.god_nodes.is_empty(),
            "containment alone must not make a god node: {:?}",
            report.god_nodes
        );
    }

    #[test]
    fn detects_a_two_file_import_cycle() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![
            node("a.ts", NodeKind::File, "a.ts", "a.ts"),
            node("b.ts", NodeKind::File, "b.ts", "b.ts"),
        ];
        g.edges = vec![imports("a.ts", "b.ts"), imports("b.ts", "a.ts")];
        let report = analyze(&g, "hash");
        assert_eq!(report.cycles.len(), 1, "got {:?}", report.cycles);
        assert!(report.cycles[0].len() >= 3, "cycle should close on itself");
    }

    #[test]
    fn reports_no_cycle_for_an_acyclic_import_graph() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![
            node("a.ts", NodeKind::File, "a.ts", "a.ts"),
            node("b.ts", NodeKind::File, "b.ts", "b.ts"),
            node("c.ts", NodeKind::File, "c.ts", "c.ts"),
        ];
        g.edges = vec![imports("a.ts", "b.ts"), imports("b.ts", "c.ts")];
        assert!(analyze(&g, "hash").cycles.is_empty());
    }

    #[test]
    fn finds_orphans_and_clusters() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![
            node("a.ts::x", NodeKind::Function, "a.ts", "x"),
            node("a.ts::y", NodeKind::Function, "a.ts", "y"),
            node("z.ts::alone", NodeKind::Function, "z.ts", "alone"),
        ];
        g.edges = vec![call("a.ts::x", "a.ts::y", Confidence::High)];
        let report = analyze(&g, "hash");
        assert_eq!(report.orphan_total, 1);
        assert!(report.orphans[0].contains("alone"));
        assert_eq!(report.cluster_total, 1);
        assert_eq!(report.clusters[0].size, 2);
    }

    /// An interface has no call edges by construction, so listing it as an orphan
    /// is noise. Only unreferenced CALLABLES are a dead-code signal.
    #[test]
    fn non_callable_nodes_are_counted_separately_from_dead_code() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![
            node("a.ts::deadFn", NodeKind::Function, "a.ts", "deadFn"),
            node("a.ts::Shape", NodeKind::Interface, "a.ts", "Shape"),
            node("a.ts::LIMIT", NodeKind::Constant, "a.ts", "LIMIT"),
            node("a.ts::Colour", NodeKind::Enum, "a.ts", "Colour"),
        ];
        let report = analyze(&g, "h");
        assert_eq!(
            report.orphan_total, 1,
            "only the function is a dead-code signal, got {:?}",
            report.orphans
        );
        assert!(report.orphans[0].contains("deadFn"));
        assert_eq!(
            report.orphan_structural, 3,
            "interface, constant, and enum are structural, not findings"
        );
    }

    #[test]
    fn markdown_explains_why_unreferenced_functions_may_be_false_positives() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![node("a.ts::dead", NodeKind::Function, "a.ts", "dead")];
        let md = render_markdown(&analyze(&g, "h"), "now");
        assert!(md.contains("Unreferenced Functions"), "got: {md}");
        assert!(md.contains("false positives"), "must not overclaim dead code");
    }

    /// Without the stamp, session start can read a report describing a graph that
    /// no longer exists.
    #[test]
    fn markdown_records_the_source_graph_identity() {
        let g = Graph::empty("p", "/repos/p", "2026-07-30T00:00:00.000Z".to_string());
        let md = render_markdown(&analyze(&g, "deadbeefcafe1234"), "2026-07-30T01:00:00.000Z");
        assert!(md.contains("2026-07-30T00:00:00.000Z"), "missing source built_at");
        assert!(md.contains("deadbeefcafe"), "missing source content hash");
        assert!(md.contains("Staleness"), "missing the staleness warning");
    }

    /// Open question 4: a clean report must not be mistaken for a complete one.
    #[test]
    fn markdown_states_that_cross_language_edges_are_out_of_scope() {
        let g = Graph::empty("p", "/repos/p", "now".to_string());
        let md = render_markdown(&analyze(&g, "h"), "now");
        assert!(md.contains("Cross-language edges are NOT tracked"), "got: {md}");
    }

    #[test]
    fn cluster_discovery_is_deterministic() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        for i in 0..6 {
            g.nodes.push(node(
                &format!("f{i}.ts::fn"),
                NodeKind::Function,
                &format!("f{i}.ts"),
                &format!("fn{i}"),
            ));
        }
        g.edges = vec![
            call("f0.ts::fn", "f1.ts::fn", Confidence::High),
            call("f2.ts::fn", "f3.ts::fn", Confidence::High),
            call("f4.ts::fn", "f5.ts::fn", Confidence::High),
        ];
        let first = analyze(&g, "h");
        let second = analyze(&g, "h");
        assert_eq!(first.clusters, second.clusters);
        assert_eq!(first.cluster_total, 3);
    }
}
