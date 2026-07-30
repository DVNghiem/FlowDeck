//! End-to-end `fdx graph build` behaviour against a real directory tree.
//!
//! The unit tests in `commands::graph` cover helpers in isolation. These exercise
//! the whole pipeline, which is where the interesting properties live: incremental
//! skipping, deletion, warning persistence, and worktree warm-start.
//!
//! `resolve_repo_identity` only requires `.git` to be a directory, so these build
//! a fixture tree without shelling out to git.

use fdx::commands::graph::build;
use std::path::{Path, PathBuf};

/// A throwaway repo plus its own HOME, so caches never touch the real one.
struct Fixture {
    repo: PathBuf,
    home: PathBuf,
}

impl Fixture {
    fn new(label: &str) -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "fdx-graph-build-{}-{}-{}",
            label,
            std::process::id(),
            nanos
        ));
        let repo = base.join("repo");
        let home = base.join("home");
        std::fs::create_dir_all(repo.join(".git")).expect("fixture repo");
        std::fs::create_dir_all(&home).expect("fixture home");
        Self { repo, home }
    }

    fn write(&self, rel: &str, contents: &str) {
        let path = self.repo.join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("parent dir");
        }
        std::fs::write(path, contents).expect("write fixture file");
    }

    fn write_bytes(&self, rel: &str, bytes: &[u8]) {
        std::fs::write(self.repo.join(rel), bytes).expect("write fixture bytes");
    }

    fn remove(&self, rel: &str) {
        std::fs::remove_file(self.repo.join(rel)).expect("remove fixture file");
    }

    fn build(&self) -> build::BuildStats {
        build::build(&self.home, &self.repo).expect("build must succeed")
    }

    fn graph(&self, stats: &build::BuildStats) -> fdx::commands::graph::types::Graph {
        let raw = std::fs::read_to_string(&stats.graph_path).expect("graph must exist");
        serde_json::from_str(&raw).expect("graph must deserialize")
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if let Some(base) = self.repo.parent() {
            let _ = std::fs::remove_dir_all(base);
        }
    }
}

fn seed(fixture: &Fixture) {
    fixture.write(
        "src/util.ts",
        "export function helper(): number {\n  return 1;\n}\n",
    );
    fixture.write(
        "src/main.ts",
        "import { helper } from './util';\n\nexport function run(): number {\n  return helper();\n}\n",
    );
}

#[test]
fn builds_nodes_edges_and_resolves_an_imported_call() {
    let fixture = Fixture::new("basic");
    seed(&fixture);
    let stats = fixture.build();

    assert_eq!(stats.files_parsed, 2);
    assert_eq!(stats.files_skipped, 0);
    assert!(stats.wrote);

    let graph = fixture.graph(&stats);
    assert!(
        graph.nodes.iter().any(|n| n.name == "helper"),
        "helper must be a node"
    );
    assert!(
        graph.nodes.iter().any(|n| n.name == "run"),
        "exported run must be a node, which the old walker missed"
    );

    use fdx::commands::graph::types::{Confidence, EdgeKind};
    let call = graph
        .edges
        .iter()
        .find(|e| e.kind == EdgeKind::Calls && e.to.ends_with("::helper"))
        .expect("run() calls helper() across an import");
    assert_eq!(
        call.confidence,
        Confidence::High,
        "a call into a directly imported file is provable"
    );
}

#[test]
fn second_build_skips_everything_and_does_not_rewrite() {
    let fixture = Fixture::new("incremental");
    seed(&fixture);
    let first = fixture.build();
    let before = std::fs::read(&first.graph_path).expect("read graph");

    let second = fixture.build();
    assert_eq!(
        second.files_parsed, 0,
        "nothing changed, so nothing to parse"
    );
    assert_eq!(second.files_skipped, 2);
    assert!(!second.wrote, "a no-op build must not rewrite the file");

    let after = std::fs::read(&second.graph_path).expect("read graph");
    assert_eq!(before, after, "graph bytes must be identical");
}

#[test]
fn editing_one_file_reparses_only_that_file() {
    let fixture = Fixture::new("partial");
    seed(&fixture);
    fixture.build();

    fixture.write(
        "src/util.ts",
        "export function helper(): number {\n  return 2;\n}\n\nexport function extra(): void {}\n",
    );
    let stats = fixture.build();
    assert_eq!(stats.files_parsed, 1, "only util.ts changed");
    assert_eq!(stats.files_skipped, 1);

    let graph = fixture.graph(&stats);
    assert!(graph.nodes.iter().any(|n| n.name == "extra"));
}

/// Hashing changed files never notices a file is GONE, so without a stale phase
/// its nodes linger as ghosts that `query` and `report` still surface.
#[test]
fn deleting_a_file_removes_its_nodes_edges_and_hashes() {
    let fixture = Fixture::new("deletion");
    seed(&fixture);
    fixture.build();

    fixture.remove("src/util.ts");
    let stats = fixture.build();
    assert_eq!(stats.files_removed, 1);

    let graph = fixture.graph(&stats);
    assert!(
        !graph.nodes.iter().any(|n| n.file == "src/util.ts"),
        "deleted file's nodes must be gone"
    );
    assert!(
        !graph.file_hashes.contains_key("src/util.ts"),
        "deleted file's hash must be gone"
    );
    assert!(
        !graph
            .edges
            .iter()
            .any(|e| e.from.contains("util.ts") || e.to.contains("util.ts")),
        "no edge may dangle to a removed node"
    );
    assert!(
        !graph.pending_calls.contains_key("src/util.ts"),
        "deleted file's pending calls must be gone"
    );
}

/// A callee moving files must not leave the unchanged caller pointing at a dead
/// node. Only a global re-resolve over persisted pending calls catches this.
#[test]
fn moving_a_function_to_another_file_repoints_the_call() {
    let fixture = Fixture::new("moved");
    seed(&fixture);
    fixture.build();

    // `helper` relocates from util.ts to moved.ts. main.ts is untouched except
    // for its import specifier.
    fixture.remove("src/util.ts");
    fixture.write(
        "src/moved.ts",
        "export function helper(): number {\n  return 1;\n}\n",
    );
    fixture.write(
        "src/main.ts",
        "import { helper } from './moved';\n\nexport function run(): number {\n  return helper();\n}\n",
    );
    let stats = fixture.build();
    let graph = fixture.graph(&stats);

    use fdx::commands::graph::types::EdgeKind;
    let targets: Vec<&str> = graph
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Calls)
        .map(|e| e.to.as_str())
        .collect();
    assert!(
        targets.iter().any(|t| t.starts_with("src/moved.ts")),
        "call must repoint to the new location, got {targets:?}"
    );
    assert!(
        !targets.iter().any(|t| t.starts_with("src/util.ts")),
        "no edge may still point at the old location, got {targets:?}"
    );
}

/// A file whose only output is a warning must still make the graph dirty, or the
/// warning is printed once and then lost, which defeats a machine-readable
/// warning contract.
#[test]
fn an_unreadable_file_persists_a_structured_warning() {
    let fixture = Fixture::new("warning");
    seed(&fixture);
    fixture.build();

    fixture.write_bytes("src/bad.ts", b"export function ok() {}\n\xff\xfe\n");
    let stats = fixture.build();
    assert_eq!(stats.warnings, 1);
    assert_eq!(
        stats.warnings_by_kind,
        vec![("unreadable".to_string(), 1)],
        "the caller must be able to say WHAT went wrong"
    );
    assert!(stats.wrote, "a new warning must be persisted");

    let graph = fixture.graph(&stats);
    assert_eq!(graph.warnings.len(), 1);
    assert_eq!(graph.warnings[0].file, "src/bad.ts");
}

/// A persistently unreadable file must not defeat byte-stability forever.
#[test]
fn a_repeated_warning_does_not_rewrite_or_accumulate() {
    let fixture = Fixture::new("warning-stable");
    seed(&fixture);
    fixture.write_bytes("src/bad.ts", b"\xff\xfe\n");
    let first = fixture.build();
    let before = std::fs::read(&first.graph_path).expect("read graph");

    let second = fixture.build();
    assert!(!second.wrote, "an already-recorded warning is not a change");
    assert_eq!(second.warnings, 1, "warnings must not accumulate");
    let after = std::fs::read(&second.graph_path).expect("read graph");
    assert_eq!(before, after);
}

#[test]
fn the_graph_records_its_canonical_root_and_lands_under_codebase() {
    let fixture = Fixture::new("identity");
    seed(&fixture);
    let stats = fixture.build();

    let as_str = stats.graph_path.to_string_lossy();
    assert!(
        as_str.contains("/.fd-plan/") && as_str.contains("/.codebase/"),
        "graph must live under ~/.fd-plan/<slug>/.codebase/, got {as_str}"
    );

    let graph = fixture.graph(&stats);
    let expected = fixture
        .repo
        .canonicalize()
        .expect("repo canonicalizes")
        .to_string_lossy()
        .to_string();
    assert_eq!(graph.canonical_root, expected);
    assert!(graph.is_usable_for(&expected));
    assert!(
        !graph.is_usable_for("/some/other/repo"),
        "a graph must refuse to be used for a different repository"
    );
}

/// Building outside a git repository is an error, not a silent empty graph.
#[test]
fn building_outside_a_repository_fails_clearly() {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("fdx-not-a-repo-{}-{}", std::process::id(), nanos));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let home = dir.join("home");
    std::fs::create_dir_all(&home).expect("home");

    let result = build::build(&home, &dir);
    let message = result
        .err()
        .map(|e| e.to_string())
        .unwrap_or_else(|| "unexpectedly succeeded".to_string());
    assert!(
        message.contains("not inside a git repository"),
        "got: {message}"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// The lock is what stops two waves from losing each other's cache state.
#[test]
fn a_held_lock_makes_a_build_fail_rather_than_race() {
    let fixture = Fixture::new("locked");
    seed(&fixture);
    let stats = fixture.build();

    // Simulate a build in flight by planting the lock sidecar.
    let lock = PathBuf::from(format!("{}.buildlock", stats.graph_path.display()));
    std::fs::write(&lock, "12345\n").expect("plant lock");

    let result = build::build(&fixture.home, &fixture.repo);
    let message = result
        .err()
        .map(|e| e.to_string())
        .unwrap_or_else(|| "unexpectedly succeeded".to_string());
    assert!(message.contains("in progress"), "got: {message}");

    std::fs::remove_file(&lock).expect("release lock");
    build::build(&fixture.home, &fixture.repo).expect("must build once the lock is gone");
}

/// Non-source files must not become nodes.
#[test]
fn files_without_a_grammar_are_skipped_entirely() {
    let fixture = Fixture::new("nonsource");
    seed(&fixture);
    fixture.write("README.md", "# not source\n");
    fixture.write("data.json", "{}\n");
    let stats = fixture.build();

    assert_eq!(stats.files_parsed, 2, "only the two TypeScript files");
    let graph = fixture.graph(&stats);
    assert!(
        !graph.nodes.iter().any(|n| n.file.ends_with(".md")),
        "markdown must not be a node"
    );
    assert!(!graph.file_hashes.contains_key("README.md"));
}

/// A Rust repo must get import edges from BOTH `mod x;` and `use crate::…`.
///
/// `resolve_rust_use` anchored on `PathBuf::from("src")`, which is relative to the
/// process working directory, so in a workspace layout every `use crate::…`
/// silently resolved to nothing and Rust import edges came only from `mod`.
#[test]
fn a_rust_repo_gets_import_edges_from_mod_and_use() {
    let fixture = Fixture::new("rustrepo");
    fixture.write("Cargo.toml", "[package]\nname = \"fixture\"\n");
    fixture.write("src/fee.rs", "pub fn amount() -> u32 {\n    1\n}\n");
    fixture.write(
        "src/main.rs",
        "mod fee;\nuse crate::fee::amount;\n\npub fn run() -> u32 {\n    amount()\n}\n",
    );
    let stats = fixture.build();
    let graph = fixture.graph(&stats);

    use fdx::commands::graph::types::EdgeKind;
    let imports: Vec<(&str, &str)> = graph
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Imports)
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();
    assert!(
        imports.contains(&("src/main.rs", "src/fee.rs")),
        "both `mod fee;` and `use crate::fee::amount` must reach src/fee.rs, got {imports:?}"
    );
    assert!(
        graph.nodes.iter().any(|n| n.name == "amount"),
        "Rust symbols must be extracted"
    );
}

#[test]
fn a_python_repo_gets_import_edges() {
    let fixture = Fixture::new("pythonrepo");
    fixture.write("b.py", "def bee():\n    return 1\n");
    fixture.write(
        "a.py",
        "from .b import bee\n\ndef ay():\n    return bee()\n",
    );
    let stats = fixture.build();
    let graph = fixture.graph(&stats);

    use fdx::commands::graph::types::EdgeKind;
    let imports: Vec<(&str, &str)> = graph
        .edges
        .iter()
        .filter(|e| e.kind == EdgeKind::Imports)
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();
    assert!(
        imports.contains(&("a.py", "b.py")),
        "`from .b import bee` must reach b.py, got {imports:?}"
    );
}

/// A file that loses all of its call sites must not keep stale pending calls.
///
/// `drop_files` is what clears them, and it is now guarded by a
/// `file_hashes.contains_key` check to keep cold builds off an O(files^2) path,
/// so this pins that the guard did not break the clearing.
#[test]
fn a_file_that_loses_its_calls_keeps_no_stale_pending() {
    let fixture = Fixture::new("stalepending");
    seed(&fixture);
    let stats = fixture.build();
    let graph = fixture.graph(&stats);
    assert!(
        graph.pending_calls.contains_key("src/main.ts"),
        "main.ts calls helper(), so it should have a pending call"
    );

    // Rewrite main.ts with no calls at all.
    fixture.write("src/main.ts", "export const value: number = 7;\n");
    let stats = fixture.build();
    let graph = fixture.graph(&stats);
    assert!(
        !graph.pending_calls.contains_key("src/main.ts"),
        "stale pending calls survived: {:?}",
        graph.pending_calls.get("src/main.ts")
    );
}

fn root_of(path: &Path) -> &Path {
    path.parent().expect("fixture has a parent")
}

/// A worktree seeds from the main checkout's graph rather than paying a full cold
/// build, which is the whole reason storage keys on the canonical root.
#[test]
fn a_worktree_warm_starts_from_the_main_checkout() {
    let fixture = Fixture::new("worktree");
    seed(&fixture);
    let main_stats = fixture.build();
    assert!(!main_stats.warm_started);

    // A linked worktree: `.git` is a FILE pointing at the main repo's git dir.
    // The pointed-at directory must actually exist, because identity resolution
    // validates the `<root>/.git/worktrees/<name>` shape rather than trusting it.
    let base = root_of(&fixture.repo);
    let worktree = base.join("wave-2");
    std::fs::create_dir_all(worktree.join("src")).expect("worktree dirs");
    std::fs::create_dir_all(fixture.repo.join(".git/worktrees/wave-2")).expect("worktree git dir");
    std::fs::write(
        worktree.join(".git"),
        format!(
            "gitdir: {}/.git/worktrees/wave-2\n",
            fixture.repo.canonicalize().expect("canonical").display()
        ),
    )
    .expect("worktree .git file");
    // Same content as the parent, plus one changed file.
    std::fs::copy(
        fixture.repo.join("src/util.ts"),
        worktree.join("src/util.ts"),
    )
    .expect("copy util");
    std::fs::write(
        worktree.join("src/main.ts"),
        "import { helper } from './util';\n\nexport function run(): number {\n  return helper() + 1;\n}\n",
    )
    .expect("changed main");

    let wt_stats = build::build(&fixture.home, &worktree).expect("worktree build");
    assert!(
        wt_stats.warm_started,
        "first worktree build must seed from the parent graph"
    );
    assert_ne!(
        wt_stats.graph_path, main_stats.graph_path,
        "a worktree gets its own graph file, so hashes do not thrash"
    );
    assert!(
        wt_stats.graph_path.to_string_lossy().contains("wave-2"),
        "got {}",
        wt_stats.graph_path.display()
    );
}
