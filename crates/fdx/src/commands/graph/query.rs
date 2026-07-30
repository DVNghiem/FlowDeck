//! `fdx graph query <symbol>` — definition, callers, and callees for a name.

use super::types::{Confidence, EdgeKind, Graph, Node, NodeKind};
use serde::Serialize;

/// One edge endpoint, with the confidence of the edge that produced it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Related {
    pub id: String,
    pub name: String,
    pub file: String,
    pub line: Option<u32>,
    pub confidence: Confidence,
}

/// Everything the graph knows about one matched symbol.
#[derive(Debug, Clone, Serialize)]
pub struct SymbolReport {
    pub id: String,
    /// Serialized as the graph's own kind vocabulary (`function`, not `fn`), so
    /// this JSON agrees with graph.json and with `fdx read --format json`.
    pub kind: NodeKind,
    pub name: String,
    pub file: String,
    pub line: Option<u32>,
    /// Enclosing container, derived from the id.
    pub parent: Option<String>,
    pub callers: Vec<Related>,
    pub callees: Vec<Related>,
    pub imports: Vec<String>,
}

fn related(
    by_id: &std::collections::HashMap<&str, &Node>,
    id: &str,
    confidence: Confidence,
) -> Option<Related> {
    let node = by_id.get(id)?;
    Some(Related {
        id: node.id.clone(),
        name: node.name.clone(),
        file: node.file.clone(),
        line: node.line,
        confidence,
    })
}

/// Sort by confidence descending, then by file for stable output.
fn sort_related(items: &mut Vec<Related>) {
    items.sort_by(|a, b| {
        b.confidence
            .cmp(&a.confidence)
            .then(a.file.cmp(&b.file))
            .then(a.name.cmp(&b.name))
    });
    items.dedup_by(|a, b| a.id == b.id);
}

/// Match nodes by exact name, falling back to case-insensitive.
fn matching_nodes<'g>(graph: &'g Graph, symbol: &str) -> Vec<&'g Node> {
    let exact: Vec<&Node> = graph.nodes.iter().filter(|n| n.name == symbol).collect();
    if !exact.is_empty() {
        return exact;
    }
    let lower = symbol.to_lowercase();
    graph
        .nodes
        .iter()
        .filter(|n| n.name.to_lowercase() == lower)
        .collect()
}

/// Look up `symbol` and report its position in the graph.
///
/// Returns an empty vector when nothing matches, which the caller renders as a
/// rebuild hint rather than an error.
pub fn query(graph: &Graph, symbol: &str) -> Vec<SymbolReport> {
    // One id index for the whole query. `graph.node()` is a linear scan, and it
    // was being called once per caller edge and once per callee edge.
    let by_id: std::collections::HashMap<&str, &Node> =
        graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    matching_nodes(graph, symbol)
        .into_iter()
        .map(|node| {
            let mut callers: Vec<Related> = graph
                .edges
                .iter()
                .filter(|e| e.kind == EdgeKind::Calls && e.to == node.id)
                .filter_map(|e| related(&by_id, &e.from, e.confidence))
                .collect();
            let mut callees: Vec<Related> = graph
                .edges
                .iter()
                .filter(|e| e.kind == EdgeKind::Calls && e.from == node.id)
                .filter_map(|e| related(&by_id, &e.to, e.confidence))
                .collect();
            sort_related(&mut callers);
            sort_related(&mut callees);

            let imports: Vec<String> = graph
                .edges
                .iter()
                .filter(|e| e.kind == EdgeKind::Imports && e.from == node.file)
                .map(|e| e.to.clone())
                .collect();

            SymbolReport {
                id: node.id.clone(),
                kind: node.kind,
                name: node.name.clone(),
                file: node.file.clone(),
                line: node.line,
                parent: node.parent_id().map(|p| p.to_string()),
                callers,
                callees,
                imports,
            }
        })
        .collect()
}

/// Render reports as text.
pub fn render_text(reports: &[SymbolReport], symbol: &str) -> String {
    if reports.is_empty() {
        return format!("Symbol '{symbol}' not found. Run `fdx graph build` to refresh.\n");
    }

    let mut out = String::new();
    for report in reports {
        out.push_str(&format!("[{}] {}\n", report.kind.label(), report.name));
        match report.line {
            Some(line) => out.push_str(&format!("  Defined: {}:{}\n", report.file, line)),
            None => out.push_str(&format!("  Defined: {}\n", report.file)),
        }
        if let Some(parent) = &report.parent {
            out.push_str(&format!("  In:      {parent}\n"));
        }

        let fmt = |items: &[Related]| -> String {
            if items.is_empty() {
                return "(none)".to_string();
            }
            items
                .iter()
                .map(|r| {
                    let mark = r.confidence.marker();
                    match r.line {
                        Some(line) => format!("{} ({}:{}){}", r.name, r.file, line, mark),
                        None => format!("{} ({}){}", r.name, r.file, mark),
                    }
                })
                .collect::<Vec<_>>()
                .join(", ")
        };

        out.push_str(&format!("  Callers: {}\n", fmt(&report.callers)));
        out.push_str(&format!("  Callees: {}\n", fmt(&report.callees)));
        if !report.imports.is_empty() {
            out.push_str(&format!("  Imports: {}\n", report.imports.join(", ")));
        }
        out.push('\n');
    }
    out.push_str(Confidence::legend());
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::super::types::{Edge, NodeKind};
    use super::*;

    fn node(id: &str, kind: NodeKind, file: &str, name: &str) -> Node {
        Node {
            id: id.to_string(),
            kind,
            file: file.to_string(),
            line: Some(3),
            name: name.to_string(),
        }
    }

    fn fixture() -> Graph {
        let mut g = Graph::empty("p", "/repos/p", "now".to_string());
        g.nodes = vec![
            node("a.ts::caller", NodeKind::Function, "a.ts", "caller"),
            node("a.ts::target", NodeKind::Function, "a.ts", "target"),
            node("a.ts::leaf", NodeKind::Function, "a.ts", "leaf"),
        ];
        g.edges = vec![
            Edge {
                from: "a.ts::caller".to_string(),
                to: "a.ts::target".to_string(),
                kind: EdgeKind::Calls,
                confidence: Confidence::High,
            },
            Edge {
                from: "a.ts::target".to_string(),
                to: "a.ts::leaf".to_string(),
                kind: EdgeKind::Calls,
                confidence: Confidence::Medium,
            },
        ];
        g
    }

    #[test]
    fn reports_callers_and_callees() {
        let g = fixture();
        let reports = query(&g, "target");
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].callers.len(), 1);
        assert_eq!(reports[0].callers[0].name, "caller");
        assert_eq!(reports[0].callees.len(), 1);
        assert_eq!(reports[0].callees[0].name, "leaf");
        assert_eq!(reports[0].callees[0].confidence, Confidence::Medium);
    }

    #[test]
    fn missing_symbol_renders_a_rebuild_hint() {
        let g = fixture();
        assert!(query(&g, "nope").is_empty());
        let text = render_text(&[], "nope");
        assert!(text.contains("fdx graph build"), "got: {text}");
    }

    #[test]
    fn falls_back_to_case_insensitive_match() {
        let g = fixture();
        assert_eq!(query(&g, "TARGET").len(), 1);
    }

    #[test]
    fn exact_match_wins_over_case_insensitive() {
        let mut g = fixture();
        g.nodes
            .push(node("b.ts::Target", NodeKind::Function, "b.ts", "Target"));
        let reports = query(&g, "Target");
        assert_eq!(
            reports.len(),
            1,
            "exact match must not also pull in `target`"
        );
        assert_eq!(reports[0].file, "b.ts");
    }

    #[test]
    fn text_output_marks_lower_confidence() {
        let g = fixture();
        let text = render_text(&query(&g, "target"), "target");
        assert!(text.contains("leaf (a.ts:3) ~"), "got: {text}");
    }
}
