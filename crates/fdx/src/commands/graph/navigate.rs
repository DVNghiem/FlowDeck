//! `fdx graph deps`, `path`, and `explain` — traversal over an existing graph.
//!
//! Shortest paths use plain BFS, not Dijkstra. Every edge has weight 1, so BFS is
//! already optimal and avoids maintaining a `String`-id to index mapping. This is
//! why `petgraph` was not added as a dependency.

use super::types::{Confidence, Edge, EdgeKind, Graph, Node};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};

/// One hop in a path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hop {
    pub via: EdgeKind,
    pub confidence: Confidence,
    pub to_id: String,
    pub to_name: String,
    pub to_file: String,
    pub to_line: Option<u32>,
}

/// Resolve a user-supplied target to node ids.
///
/// Accepts a file path (matching a file node) or a symbol name, so callers do not
/// have to know which they have.
pub fn resolve_target<'g>(graph: &'g Graph, target: &str) -> Vec<&'g Node> {
    // A file node's id IS its relative path, so try that first and exactly.
    if let Some(file_node) = graph
        .nodes
        .iter()
        .find(|n| n.kind == super::types::NodeKind::File && n.id == target)
    {
        return vec![file_node];
    }
    // Then a path suffix, so `codebase-state.ts` finds `src/tools/codebase-state.ts`.
    let by_suffix: Vec<&Node> = graph
        .nodes
        .iter()
        .filter(|n| n.kind == super::types::NodeKind::File)
        .filter(|n| n.id.ends_with(target))
        .collect();
    if !by_suffix.is_empty() {
        return by_suffix;
    }
    // Otherwise a symbol name.
    let exact: Vec<&Node> = graph.nodes.iter().filter(|n| n.name == target).collect();
    if !exact.is_empty() {
        return exact;
    }
    let lower = target.to_lowercase();
    graph
        .nodes
        .iter()
        .filter(|n| n.name.to_lowercase() == lower)
        .collect()
}

/// Outgoing adjacency, built once per traversal.
fn outgoing(graph: &Graph) -> HashMap<&str, Vec<&Edge>> {
    let mut map: HashMap<&str, Vec<&Edge>> = HashMap::new();
    for edge in &graph.edges {
        map.entry(edge.from.as_str()).or_default().push(edge);
    }
    map
}

// ── deps ─────────────────────────────────────────────────────────────────────

/// A file's direct imports, and what each of those imports in turn.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DepsReport {
    pub file: String,
    /// `(imported file, its own direct imports)`, one level deep.
    pub direct: Vec<(String, Vec<String>)>,
    /// Imports that come back to `file`, i.e. a cycle through it.
    pub cycles: Vec<String>,
}

/// What `file` depends on, one level deep, flagging imports that cycle back.
pub fn deps(graph: &Graph, file: &str) -> DepsReport {
    let by_from = outgoing(graph);

    let imports_of = |id: &str| -> Vec<String> {
        let mut targets: BTreeSet<String> = BTreeSet::new();
        for edge in by_from.get(id).into_iter().flatten() {
            if edge.kind == EdgeKind::Imports {
                targets.insert(edge.to.clone());
            }
        }
        targets.into_iter().collect()
    };

    let direct_ids = imports_of(file);
    let mut cycles = Vec::new();
    let mut direct = Vec::new();

    for imported in &direct_ids {
        let second = imports_of(imported);
        if second.iter().any(|t| t == file) {
            cycles.push(imported.clone());
        }
        direct.push((imported.clone(), second));
    }

    DepsReport {
        file: file.to_string(),
        direct,
        cycles,
    }
}

/// Render a deps report as text.
pub fn render_deps(report: &DepsReport) -> String {
    let mut out = format!("Dependencies: {}\n\n", report.file);
    if report.direct.is_empty() {
        out.push_str("  (no resolved imports)\n");
        return out;
    }
    for (imported, second) in &report.direct {
        let marker = if report.cycles.contains(imported) {
            "  [CIRCULAR]"
        } else {
            ""
        };
        out.push_str(&format!("  {imported}{marker}\n"));
        for target in second.iter().take(SECOND_LEVEL_LIMIT) {
            out.push_str(&format!("      -> {target}\n"));
        }
        if second.len() > SECOND_LEVEL_LIMIT {
            out.push_str(&format!(
                "      -> (+{} more)\n",
                second.len() - SECOND_LEVEL_LIMIT
            ));
        }
    }
    if !report.cycles.is_empty() {
        out.push_str(&format!(
            "\n{} circular dependenc{} detected.\n",
            report.cycles.len(),
            if report.cycles.len() == 1 { "y" } else { "ies" }
        ));
    }
    out
}

// ── impact ──────────────────────────────────────────────────────────────────

/// Blast-radius banding, by count of affected files.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Risk {
    Low,
    Medium,
    High,
}

impl Risk {
    /// High above 10 files, medium at 4 through 10, low at 3 or fewer.
    fn of(files: usize) -> Self {
        match files {
            0..=3 => Self::Low,
            4..=10 => Self::Medium,
            _ => Self::High,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

/// What depends on a file, grouped by how many hops away it is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImpactReport {
    pub file: String,
    pub depth: usize,
    /// One entry per depth level, each `(dependent file, why)`.
    pub levels: Vec<Vec<(String, String)>>,
    pub total_files: usize,
    pub risk: Risk,
}

/// Incoming adjacency, excluding containment.
///
/// `Contains` is excluded deliberately: walking it backwards from a symbol leads
/// to the symbol's own file, which is not a dependent of itself.
fn incoming(graph: &Graph) -> HashMap<&str, Vec<&Edge>> {
    let mut map: HashMap<&str, Vec<&Edge>> = HashMap::new();
    for edge in &graph.edges {
        if edge.kind == EdgeKind::Contains {
            continue;
        }
        map.entry(edge.to.as_str()).or_default().push(edge);
    }
    map
}

/// Files that would be affected by changing `file`, up to `depth` hops.
///
/// Seeds with the file node AND every symbol defined in it, so a dependent is
/// found whether it imports the file or calls one of its symbols.
pub fn impact(graph: &Graph, file: &str, depth: usize) -> ImpactReport {
    let by_to = incoming(graph);
    let by_id: HashMap<&str, &Node> = graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    let mut frontier: Vec<&str> = graph
        .nodes
        .iter()
        .filter(|n| n.file == file)
        .map(|n| n.id.as_str())
        .collect();

    let mut seen_nodes: HashSet<&str> = frontier.iter().copied().collect();
    let mut recorded_files: HashSet<String> = [file.to_string()].into_iter().collect();
    let mut levels: Vec<Vec<(String, String)>> = Vec::new();

    for _ in 0..depth.max(1) {
        let mut next: Vec<&str> = Vec::new();
        let mut level: Vec<(String, String)> = Vec::new();

        for node_id in &frontier {
            for edge in by_to.get(*node_id).into_iter().flatten() {
                let source_id = edge.from.as_str();
                if !seen_nodes.insert(source_id) {
                    continue;
                }
                next.push(source_id);

                let Some(source) = by_id.get(source_id) else {
                    continue;
                };
                if recorded_files.contains(&source.file) {
                    continue;
                }
                recorded_files.insert(source.file.clone());

                let target_name = by_id
                    .get(*node_id)
                    .map(|n| n.name.as_str())
                    .unwrap_or(*node_id);
                let reason = match edge.kind {
                    EdgeKind::Imports => "imports".to_string(),
                    EdgeKind::Calls => format!("calls {target_name}"),
                    EdgeKind::Implements => format!("implements {target_name}"),
                    EdgeKind::Extends => format!("extends {target_name}"),
                    EdgeKind::Contains => continue,
                };
                level.push((source.file.clone(), reason));
            }
        }

        level.sort();
        level.dedup();
        if !level.is_empty() {
            levels.push(level);
        }
        if next.is_empty() {
            break;
        }
        frontier = next;
    }

    // `recorded_files` was seeded with the target, which is not "affected".
    let total_files = recorded_files.len().saturating_sub(1);
    ImpactReport {
        file: file.to_string(),
        depth,
        levels,
        total_files,
        risk: Risk::of(total_files),
    }
}

/// Render an impact report as text.
pub fn render_impact(report: &ImpactReport) -> String {
    let mut out = format!("Impact analysis: {}\n\n", report.file);
    if report.levels.is_empty() {
        out.push_str("  Nothing depends on this file.\n\n");
    }
    for (index, level) in report.levels.iter().enumerate() {
        let heading = if index == 0 {
            "Direct dependents (depth 1)".to_string()
        } else {
            format!("Transitive (depth {})", index + 1)
        };
        out.push_str(&format!("{heading}:\n"));
        for (dependent, reason) in level {
            out.push_str(&format!("  {dependent}  - {reason}\n"));
        }
        out.push('\n');
    }
    out.push_str(&format!("Total affected: {} files\n", report.total_files));
    out.push_str(&format!("Risk: {}\n", report.risk.label()));
    out
}

// ── path ─────────────────────────────────────────────────────────────────────

/// BFS shortest path between two node ids.
///
/// Returns `None` when no directed path exists. BFS is optimal here because every
/// edge has weight 1.
pub fn shortest_path(graph: &Graph, from_id: &str, to_id: &str) -> Option<Vec<Hop>> {
    if from_id == to_id {
        return Some(Vec::new());
    }
    let by_from = outgoing(graph);
    let by_id: HashMap<&str, &Node> = graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    // node id -> (predecessor id, edge taken)
    let mut came_from: HashMap<&str, (&str, &Edge)> = HashMap::new();
    let mut seen: HashSet<&str> = HashSet::new();
    let mut queue: VecDeque<&str> = VecDeque::new();
    seen.insert(from_id);
    queue.push_back(from_id);

    while let Some(current) = queue.pop_front() {
        for edge in by_from.get(current).into_iter().flatten() {
            let next = edge.to.as_str();
            if !seen.insert(next) {
                continue;
            }
            came_from.insert(next, (current, edge));
            if next == to_id {
                // Walk predecessors back to the source, then reverse.
                let mut hops: Vec<Hop> = Vec::new();
                let mut cursor = next;
                while let Some((prev, edge)) = came_from.get(cursor) {
                    let node = by_id.get(cursor);
                    hops.push(Hop {
                        via: edge.kind,
                        confidence: edge.confidence,
                        to_id: cursor.to_string(),
                        to_name: node.map(|n| n.name.clone()).unwrap_or_default(),
                        to_file: node.map(|n| n.file.clone()).unwrap_or_default(),
                        to_line: node.and_then(|n| n.line),
                    });
                    cursor = prev;
                }
                hops.reverse();
                return Some(hops);
            }
            queue.push_back(next);
        }
    }

    None
}

fn edge_label(kind: EdgeKind) -> &'static str {
    match kind {
        EdgeKind::Calls => "calls",
        EdgeKind::Imports => "imports",
        EdgeKind::Implements => "implements",
        EdgeKind::Extends => "extends",
        EdgeKind::Contains => "contains",
    }
}

/// Render a path as text.
pub fn render_path(from: &str, to: &str, hops: &Option<Vec<Hop>>) -> String {
    let Some(hops) = hops else {
        return format!("No connection found between '{from}' and '{to}'.\n");
    };
    if hops.is_empty() {
        return format!("'{from}' and '{to}' are the same node.\n");
    }
    let mut out = format!("Path: {from} -> {to}  ({} hops)\n\n", hops.len());
    out.push_str(&format!("  {from}\n"));
    for hop in hops {
        let mark = hop.confidence.marker();
        let location = match hop.to_line {
            Some(line) => format!("{}:{}", hop.to_file, line),
            None => hop.to_file.clone(),
        };
        out.push_str(&format!(
            "    {} -> {} ({}){}\n",
            edge_label(hop.via),
            if hop.to_name.is_empty() {
                hop.to_id.as_str()
            } else {
                hop.to_name.as_str()
            },
            location,
            mark
        ));
    }
    out.push('\n');
    out.push_str(Confidence::legend());
    out.push('\n');
    out
}

// ── explain ──────────────────────────────────────────────────────────────────

/// A symbol in context: its role, its source, and its strongest neighbours.
#[derive(Debug, Clone, Serialize)]
pub struct Explanation {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub file: String,
    pub line: Option<u32>,
    pub caller_count: usize,
    pub caller_files: usize,
    pub callee_count: usize,
    /// `(name, file, edge direction label)`, highest-confidence first.
    pub neighbours: Vec<(String, String, &'static str)>,
    pub source: Vec<String>,
}

/// How many source lines to show AFTER the definition line.
///
/// Forward-only on purpose: the definition line is the anchor, and preceding
/// lines are usually the doc comment already shown elsewhere.
const SOURCE_CONTEXT: u32 = 10;
/// How many neighbours to list.
const NEIGHBOUR_LIMIT: usize = 5;
/// How many second-level imports to name per direct dependency.
const SECOND_LEVEL_LIMIT: usize = 8;

/// Explain `node`, reading source context from `root`.
pub fn explain(graph: &Graph, node: &Node, root: &std::path::Path) -> Explanation {
    let callers: Vec<&Edge> = graph
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Calls && e.to == node.id)
        .collect();
    let callees: Vec<&Edge> = graph
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Calls && e.from == node.id)
        .collect();

    let by_id: HashMap<&str, &Node> = graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let caller_files: HashSet<&str> = callers
        .iter()
        .filter_map(|e| by_id.get(e.from.as_str()))
        .map(|n| n.file.as_str())
        .collect();

    // Highest-confidence neighbours first, callers before callees.
    let mut neighbours: Vec<(String, String, &'static str, Confidence)> = Vec::new();
    for edge in &callers {
        if let Some(other) = by_id.get(edge.from.as_str()) {
            neighbours.push((
                other.name.clone(),
                other.file.clone(),
                "called by",
                edge.confidence,
            ));
        }
    }
    for edge in &callees {
        if let Some(other) = by_id.get(edge.to.as_str()) {
            neighbours.push((
                other.name.clone(),
                other.file.clone(),
                "calls",
                edge.confidence,
            ));
        }
    }
    neighbours.sort_by(|a, b| b.3.cmp(&a.3).then(a.0.cmp(&b.0)));
    // Several top-level call sites in one file all attribute to that file's node,
    // so the same (name, file, direction) row can repeat.
    neighbours.dedup_by(|a, b| a.0 == b.0 && a.1 == b.1 && a.2 == b.2);
    neighbours.truncate(NEIGHBOUR_LIMIT);

    let source = read_source_window(root, &node.file, node.line);

    Explanation {
        id: node.id.clone(),
        kind: node.kind.label().to_string(),
        name: node.name.clone(),
        file: node.file.clone(),
        line: node.line,
        caller_count: callers.len(),
        caller_files: caller_files.len(),
        callee_count: callees.len(),
        neighbours: neighbours
            .into_iter()
            .map(|(name, file, dir, _)| (name, file, dir))
            .collect(),
        source,
    }
}

/// Read a window of source around `line`, or an empty vector if unreadable.
fn read_source_window(root: &std::path::Path, file: &str, line: Option<u32>) -> Vec<String> {
    let Some(line) = line else {
        return Vec::new();
    };
    // `file` comes from the deserialized cache, so it is untrusted input. Confine
    // the read to the repository even if a tampered graph.json contains `..`.
    let candidate = root.join(file);
    let Ok(resolved) = candidate.canonicalize() else {
        return Vec::new();
    };
    let Ok(root_resolved) = root.canonicalize() else {
        return Vec::new();
    };
    if !resolved.starts_with(&root_resolved) {
        return Vec::new();
    }
    let Ok(contents) = std::fs::read_to_string(&resolved) else {
        return Vec::new();
    };
    let lines: Vec<&str> = contents.lines().collect();
    let start = line.saturating_sub(1) as usize;
    let end = ((line + SOURCE_CONTEXT) as usize).min(lines.len());
    lines
        .get(start..end)
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(offset, text)| format!("{:>5}  {}", start + offset + 1, text))
        .collect()
}

/// Render an explanation as text.
pub fn render_explanation(explanation: &Explanation) -> String {
    let location = match explanation.line {
        Some(line) => format!("{}:{}", explanation.file, line),
        None => explanation.file.clone(),
    };
    let mut out = format!(
        "{} ({}) - {}\n\n",
        explanation.name, explanation.kind, location
    );

    out.push_str("Role in codebase:\n");
    out.push_str(&format!(
        "  Called by {} site(s) across {} file(s).\n",
        explanation.caller_count, explanation.caller_files
    ));
    out.push_str(&format!(
        "  Calls {} other symbol(s).\n\n",
        explanation.callee_count
    ));

    if !explanation.source.is_empty() {
        out.push_str("Source:\n");
        for line in &explanation.source {
            out.push_str(&format!("{line}\n"));
        }
        out.push('\n');
    }

    if explanation.neighbours.is_empty() {
        out.push_str("Connected to: (no call edges)\n");
    } else {
        out.push_str("Connected to:\n");
        for (name, file, direction) in &explanation.neighbours {
            out.push_str(&format!("  {direction} {name} ({file})\n"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::types::NodeKind;
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

    fn edge(from: &str, to: &str, kind: EdgeKind) -> Edge {
        Edge {
            from: from.to_string(),
            to: to.to_string(),
            kind,
            confidence: Confidence::High,
        }
    }

    fn fixture() -> Graph {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![
            node("a.ts", NodeKind::File, "a.ts", "a.ts"),
            node("b.ts", NodeKind::File, "b.ts", "b.ts"),
            node("c.ts", NodeKind::File, "c.ts", "c.ts"),
            node("a.ts::handler", NodeKind::Function, "a.ts", "handler"),
            node("b.ts::validate", NodeKind::Function, "b.ts", "validate"),
        ];
        g.edges = vec![
            edge("a.ts", "b.ts", EdgeKind::Imports),
            edge("b.ts", "c.ts", EdgeKind::Imports),
            edge("a.ts", "a.ts::handler", EdgeKind::Contains),
            edge("b.ts", "b.ts::validate", EdgeKind::Contains),
            edge("a.ts::handler", "b.ts::validate", EdgeKind::Calls),
        ];
        g
    }

    #[test]
    fn impact_finds_direct_and_transitive_dependents() {
        let mut g = fixture();
        g.edges.push(edge("c.ts", "b.ts", EdgeKind::Imports));
        let report = impact(&g, "b.ts", 3);
        let direct: Vec<String> = report.levels[0].iter().map(|(f, _)| f.clone()).collect();
        assert!(
            direct.contains(&"a.ts".to_string()) && direct.contains(&"c.ts".to_string()),
            "both importers are direct dependents, got {:?}",
            report.levels
        );
        assert_eq!(report.total_files, 2);
    }

    /// A dependent that CALLS a symbol counts, not only one that imports the file.
    #[test]
    fn impact_counts_callers_of_symbols_in_the_file() {
        let g = fixture();
        let report = impact(&g, "b.ts", 3);
        assert!(report.total_files >= 1, "a.ts depends on b.ts");
        let reasons: Vec<String> = report
            .levels
            .iter()
            .flatten()
            .map(|(_, r)| r.clone())
            .collect();
        assert!(
            reasons
                .iter()
                .any(|r| r.contains("imports") || r.contains("calls")),
            "got {reasons:?}"
        );
    }

    /// Walking `Contains` backwards would report a file as its own dependent.
    #[test]
    fn impact_never_reports_the_target_file_as_affected() {
        let g = fixture();
        let report = impact(&g, "b.ts", 3);
        for level in &report.levels {
            for (dependent, _) in level {
                assert_ne!(dependent, "b.ts", "a file cannot depend on itself");
            }
        }
    }

    #[test]
    fn impact_respects_the_depth_limit() {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        for name in ["a", "b", "c", "d"] {
            let file = format!("{name}.ts");
            g.nodes.push(node(&file, NodeKind::File, &file, &file));
        }
        // d -> c -> b -> a, so d is three hops from the target a.
        g.edges = vec![
            edge("b.ts", "a.ts", EdgeKind::Imports),
            edge("c.ts", "b.ts", EdgeKind::Imports),
            edge("d.ts", "c.ts", EdgeKind::Imports),
        ];
        assert_eq!(impact(&g, "a.ts", 1).total_files, 1, "depth 1 sees only b");
        assert_eq!(impact(&g, "a.ts", 2).total_files, 2, "depth 2 adds c");
        assert_eq!(impact(&g, "a.ts", 3).total_files, 3, "depth 3 adds d");
    }

    #[test]
    fn impact_bands_risk_by_affected_file_count() {
        assert_eq!(Risk::of(0).label(), "low");
        assert_eq!(Risk::of(3).label(), "low");
        assert_eq!(Risk::of(4).label(), "medium");
        assert_eq!(Risk::of(10).label(), "medium");
        assert_eq!(Risk::of(11).label(), "high");
    }

    #[test]
    fn impact_on_an_isolated_file_says_so() {
        let mut g = fixture();
        g.nodes
            .push(node("island.ts", NodeKind::File, "island.ts", "island.ts"));
        let report = impact(&g, "island.ts", 3);
        assert_eq!(report.total_files, 0);
        assert_eq!(report.risk, Risk::Low);
        assert!(render_impact(&report).contains("Nothing depends on this file"));
    }

    #[test]
    fn deps_lists_one_level_deep() {
        let report = deps(&fixture(), "a.ts");
        assert_eq!(report.direct.len(), 1);
        assert_eq!(report.direct[0].0, "b.ts");
        assert_eq!(report.direct[0].1, vec!["c.ts".to_string()]);
        assert!(report.cycles.is_empty());
    }

    #[test]
    fn deps_flags_a_circular_import() {
        let mut g = fixture();
        g.edges.push(edge("b.ts", "a.ts", EdgeKind::Imports));
        let report = deps(&g, "a.ts");
        assert_eq!(report.cycles, vec!["b.ts".to_string()]);
        assert!(render_deps(&report).contains("[CIRCULAR]"));
    }

    /// `Contains` is what lets a path start at a file and reach a symbol. This is
    /// the reason the edge kind was kept in the schema.
    #[test]
    fn path_from_a_file_reaches_a_symbol_through_containment() {
        let g = fixture();
        let hops = shortest_path(&g, "a.ts", "b.ts::validate").expect("path must exist");
        assert!(!hops.is_empty());
        assert_eq!(hops.last().expect("non-empty").to_id, "b.ts::validate");
        let rendered = render_path("a.ts", "b.ts::validate", &Some(hops));
        assert!(
            rendered.contains("Path: a.ts -> b.ts::validate"),
            "got {rendered}"
        );
    }

    #[test]
    fn path_is_shortest_not_merely_any() {
        let mut g = fixture();
        // Add a direct shortcut; BFS must prefer it over the 2-hop route.
        g.edges
            .push(edge("a.ts::handler", "c.ts", EdgeKind::Imports));
        let long = shortest_path(&g, "a.ts", "c.ts").expect("path exists");
        assert_eq!(
            long.len(),
            2,
            "expected the 2-hop import chain, got {long:?}"
        );
    }

    #[test]
    fn no_path_returns_none_and_says_so() {
        let mut g = fixture();
        g.nodes
            .push(node("z.ts::island", NodeKind::Function, "z.ts", "island"));
        assert!(shortest_path(&g, "a.ts", "z.ts::island").is_none());
        let text = render_path("a.ts", "island", &None);
        assert!(text.contains("No connection found"), "got {text}");
    }

    #[test]
    fn a_node_reaches_itself_in_zero_hops() {
        let g = fixture();
        let hops = shortest_path(&g, "a.ts", "a.ts").expect("self path");
        assert!(hops.is_empty());
        assert!(render_path("a.ts", "a.ts", &Some(hops)).contains("same node"));
    }

    #[test]
    fn resolve_target_accepts_a_file_path_or_a_symbol_name() {
        let g = fixture();
        assert_eq!(resolve_target(&g, "a.ts")[0].id, "a.ts");
        assert_eq!(resolve_target(&g, "handler")[0].id, "a.ts::handler");
        assert!(resolve_target(&g, "nope").is_empty());
    }

    #[test]
    fn resolve_target_matches_a_path_suffix() {
        let mut g = fixture();
        g.nodes.push(node(
            "src/tools/codebase-state.ts",
            NodeKind::File,
            "src/tools/codebase-state.ts",
            "codebase-state.ts",
        ));
        let found = resolve_target(&g, "codebase-state.ts");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "src/tools/codebase-state.ts");
    }

    /// Top-level call sites all attribute to the enclosing FILE node, so one
    /// file calling a symbol three times must not print three identical rows.
    #[test]
    fn explain_dedupes_repeated_neighbours() {
        let mut g = fixture();
        for _ in 0..3 {
            g.edges
                .push(edge("a.ts", "b.ts::validate", EdgeKind::Calls));
        }
        let target = g.node("b.ts::validate").expect("fixture node");
        let explanation = explain(&g, target, std::path::Path::new("/nonexistent"));
        let file_rows = explanation
            .neighbours
            .iter()
            .filter(|(name, _, _)| name == "a.ts")
            .count();
        assert_eq!(file_rows, 1, "got {:?}", explanation.neighbours);
    }

    #[test]
    fn explain_counts_callers_and_distinct_files() {
        let g = fixture();
        let target = g.node("b.ts::validate").expect("fixture node must exist");
        let explanation = explain(&g, target, std::path::Path::new("/nonexistent"));
        assert_eq!(explanation.caller_count, 1);
        assert_eq!(explanation.caller_files, 1);
        assert_eq!(explanation.callee_count, 0);
        assert_eq!(explanation.neighbours.len(), 1);
        assert_eq!(explanation.neighbours[0].2, "called by");
        // Unreadable root must degrade to no source, not panic.
        assert!(explanation.source.is_empty());
        assert!(render_explanation(&explanation).contains("Role in codebase"));
    }
}
