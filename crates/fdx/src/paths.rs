//! Path helpers for the per-topic planning artifacts (`~/.fd-plan/<slug>/<topic>/`).
//!
//! These are a port of `src/tools/planning-state-lib.ts` in TypeScript. The two
//! implementations MUST stay in sync — drift breaks the fdx-context and
//! fdx-decisions tools which write to these paths. See `tests/fixtures/path-scheme.json`
//! for the cross-runtime parity test.

use std::path::{Path, PathBuf};

/// Maximum length for a slugified topic. Matches the TypeScript `slugifyTopic` slice.
const SLUG_MAX_LEN: usize = 64;

/// Reserved directory names under the planning root that are not topics.
const RESERVED_PLANNING_ENTRIES: &[&str] = &["phases", "logs", "cache"];

/// Context file name (per-topic agent output log).
pub const CONTEXT_FILE: &str = "context.md";

/// Decisions file name (per-topic design decision log).
pub const DECISIONS_FILE: &str = "decisions.md";

/// Task file name.
pub const TASK_FILE: &str = "task.md";

/// Plan file name.
pub const PLAN_FILE: &str = "plan.md";

/// Affect file name (files impacted by the topic).
pub const AFFECT_FILE: &str = "affect.md";

/// Normalize a free-form topic name into a directory-safe slug.
///
/// Mirrors `src/tools/planning-state-lib.ts:slugifyTopic` (the canonical TS impl).
/// Returns an empty string when nothing usable remains.
pub fn slugify_topic(topic: &str) -> String {
    let s = topic.trim().to_lowercase();
    // Replace any non-[a-z0-9] run with a single hyphen.
    let mut out = String::with_capacity(s.len());
    let mut in_run = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            in_run = false;
        } else if !in_run {
            out.push('-');
            in_run = true;
        }
    }
    // Strip leading/trailing hyphens, then slice to max length.
    let trimmed: String = out.trim_matches('-').to_string();
    trimmed.chars().take(SLUG_MAX_LEN).collect()
}

/// Global planning root: `~/.fd-plan/<project-slug>/`.
pub fn planning_dir(home: &Path, project_slug: &str) -> PathBuf {
    home.join(".fd-plan").join(project_slug)
}

/// Per-topic directory: `~/.fd-plan/<project-slug>/<topic-slug>/`.
pub fn topic_dir(home: &Path, project_slug: &str, topic: &str) -> PathBuf {
    planning_dir(home, project_slug).join(slugify_topic(topic))
}

/// Per-topic context log path: `~/.fd-plan/<project-slug>/<topic>/context.md`.
pub fn topic_context_path(home: &Path, project_slug: &str, topic: &str) -> PathBuf {
    topic_dir(home, project_slug, topic).join(CONTEXT_FILE)
}

/// Per-topic decisions path: `~/.fd-plan/<project-slug>/<topic>/decisions.md`.
pub fn topic_decisions_path(home: &Path, project_slug: &str, topic: &str) -> PathBuf {
    topic_dir(home, project_slug, topic).join(DECISIONS_FILE)
}

/// Per-topic task path: `~/.fd-plan/<project-slug>/<topic>/task.md`.
pub fn topic_task_path(home: &Path, project_slug: &str, topic: &str) -> PathBuf {
    topic_dir(home, project_slug, topic).join(TASK_FILE)
}

/// Per-topic plan path: `~/.fd-plan/<project-slug>/<topic>/plan.md`.
pub fn topic_plan_path(home: &Path, project_slug: &str, topic: &str) -> PathBuf {
    topic_dir(home, project_slug, topic).join(PLAN_FILE)
}

/// Per-topic affect path: `~/.fd-plan/<project-slug>/<topic>/affect.md`.
pub fn topic_affect_path(home: &Path, project_slug: &str, topic: &str) -> PathBuf {
    topic_dir(home, project_slug, topic).join(AFFECT_FILE)
}

/// Project slug from a directory path's basename. Matches TS `basename(directory)`.
pub fn project_slug_from_directory(directory: &Path) -> String {
    directory
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string()
}

/// Codebase-knowledge directory: `~/.fd-plan/<project-slug>/.codebase/`.
///
/// Mirrors `codebaseDir` in `src/tools/codebase-state.ts:31`, so the graph sits
/// beside `STATE.md` and `CODEBASE_INDEX.md` rather than at the planning root.
pub fn codebase_dir(home: &Path, project_slug: &str) -> PathBuf {
    planning_dir(home, project_slug).join(".codebase")
}

/// Identity of the repository a cache describes.
///
/// `canonical_root` is shared by the main checkout and all of its linked
/// worktrees, so caches key on the repository rather than on whichever directory
/// happens to be current.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoIdentity {
    /// Absolute path to the main checkout's root.
    pub canonical_root: PathBuf,
    /// Slug derived from `canonical_root`'s basename.
    pub slug: String,
    /// Worktree name when resolved from inside a linked worktree.
    pub worktree: Option<String>,
}

/// Resolve repository identity by walking up for `.git`.
///
/// A linked worktree has a `.git` **file** containing
/// `gitdir: <main>/.git/worktrees/<name>`, so one read yields both the shared
/// canonical root and the worktree name, with no `git` subprocess.
///
/// Returns `None` outside a git repository.
pub fn resolve_repo_identity(start: &Path) -> Option<RepoIdentity> {
    let canonical_start = start.canonicalize().ok()?;
    let mut dir: &Path = canonical_start.as_path();

    loop {
        let dot_git = dir.join(".git");

        if dot_git.is_dir() {
            return Some(RepoIdentity {
                canonical_root: dir.to_path_buf(),
                slug: project_slug_from_directory(dir),
                worktree: None,
            });
        }

        if dot_git.is_file() {
            let contents = std::fs::read_to_string(&dot_git).ok()?;
            let gitdir = Path::new(contents.trim().strip_prefix("gitdir:")?.trim());
            let worktree = gitdir.file_name()?.to_str()?.to_string();
            // <main-root>/.git/worktrees/<name> — climb three levels.
            let main_root = gitdir.parent()?.parent()?.parent()?;
            return Some(RepoIdentity {
                canonical_root: main_root.to_path_buf(),
                slug: project_slug_from_directory(main_root),
                worktree: Some(worktree),
            });
        }

        dir = dir.parent()?;
    }
}

/// Graph cache file name for an identity.
///
/// Worktrees get their own file so their differing checkouts do not invalidate
/// each other's content hashes on every build.
fn graph_file_name(identity: &RepoIdentity) -> String {
    match &identity.worktree {
        Some(worktree) => format!("graph.{}.json", slugify_topic(worktree)),
        None => "graph.json".to_string(),
    }
}

/// Graph path: `~/.fd-plan/<slug>/.codebase/graph[.<worktree>].json`.
pub fn graph_path(home: &Path, identity: &RepoIdentity) -> PathBuf {
    codebase_dir(home, &identity.slug).join(graph_file_name(identity))
}

/// The main checkout's graph, used to warm-start a worktree's first build.
///
/// Equals `graph_path` when the identity is already the main checkout.
pub fn parent_graph_path(home: &Path, identity: &RepoIdentity) -> PathBuf {
    codebase_dir(home, &identity.slug).join("graph.json")
}

/// Report path beside the graph it was generated from.
pub fn graph_report_path(home: &Path, identity: &RepoIdentity) -> PathBuf {
    let name = match &identity.worktree {
        Some(worktree) => format!("GRAPH_REPORT.{}.md", slugify_topic(worktree)),
        None => "GRAPH_REPORT.md".to_string(),
    };
    codebase_dir(home, &identity.slug).join(name)
}

/// Reserved planning entries (not topics). Reserved for future use.
#[allow(dead_code)]
pub fn is_reserved_planning_entry(name: &str) -> bool {
    RESERVED_PLANNING_ENTRIES.contains(&name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_matches_ts_canonical() {
        // These cases match src/tools/planning-state-lib.ts:slugifyTopic behavior.
        assert_eq!(slugify_topic("Orchestrator Prompt"), "orchestrator-prompt");
        assert_eq!(slugify_topic("orchestrator-prompt"), "orchestrator-prompt");
        assert_eq!(slugify_topic("  Spaces  Around  "), "spaces-around");
        assert_eq!(slugify_topic("MixedCase123"), "mixedcase123");
        assert_eq!(slugify_topic("---"), "");
        assert_eq!(slugify_topic(""), "");
    }

    #[test]
    fn slugify_caps_at_max_length() {
        let long = "a".repeat(100);
        let result = slugify_topic(&long);
        assert_eq!(result.len(), SLUG_MAX_LEN);
    }

    #[test]
    fn paths_join_correctly() {
        let home = Path::new("/home/test");
        let p = topic_context_path(home, "myproj", "My Topic");
        assert_eq!(
            p.to_str().unwrap(),
            "/home/test/.fd-plan/myproj/my-topic/context.md"
        );
    }

    #[test]
    fn codebase_dir_matches_typescript_convention() {
        // Mirrors src/tools/codebase-state.ts:31.
        assert_eq!(
            codebase_dir(Path::new("/home/test"), "myproj")
                .to_str()
                .unwrap(),
            "/home/test/.fd-plan/myproj/.codebase"
        );
    }

    #[test]
    fn graph_path_is_plain_for_main_checkout() {
        let identity = RepoIdentity {
            canonical_root: PathBuf::from("/repos/flowdeck"),
            slug: "flowdeck".to_string(),
            worktree: None,
        };
        assert_eq!(
            graph_path(Path::new("/home/test"), &identity)
                .to_str()
                .unwrap(),
            "/home/test/.fd-plan/flowdeck/.codebase/graph.json"
        );
    }

    #[test]
    fn graph_path_is_suffixed_inside_a_worktree() {
        let identity = RepoIdentity {
            canonical_root: PathBuf::from("/repos/flowdeck"),
            slug: "flowdeck".to_string(),
            worktree: Some("fd-flowdeck-wave-2".to_string()),
        };
        // Worktree graph is distinct...
        assert_eq!(
            graph_path(Path::new("/home/test"), &identity)
                .to_str()
                .unwrap(),
            "/home/test/.fd-plan/flowdeck/.codebase/graph.fd-flowdeck-wave-2.json"
        );
        // ...but the warm-start source is the shared parent.
        assert_eq!(
            parent_graph_path(Path::new("/home/test"), &identity)
                .to_str()
                .unwrap(),
            "/home/test/.fd-plan/flowdeck/.codebase/graph.json"
        );
    }

    #[test]
    fn worktrees_share_a_slug_with_their_main_checkout() {
        // The whole point of keying on the canonical root: a worktree named
        // `fd-flowdeck-wave-2` must NOT become its own project slug, or every
        // wave pays a full cold build and orphans a cache directory.
        let main = RepoIdentity {
            canonical_root: PathBuf::from("/repos/flowdeck"),
            slug: "flowdeck".to_string(),
            worktree: None,
        };
        let wave = RepoIdentity {
            canonical_root: PathBuf::from("/repos/flowdeck"),
            slug: "flowdeck".to_string(),
            worktree: Some("fd-flowdeck-wave-2".to_string()),
        };
        assert_eq!(main.slug, wave.slug);
        assert_eq!(
            codebase_dir(Path::new("/home/test"), &main.slug),
            codebase_dir(Path::new("/home/test"), &wave.slug)
        );
    }

    #[test]
    fn resolve_repo_identity_finds_the_main_checkout() {
        // This crate lives inside the flowdeck repo, so resolution must succeed
        // and report a worktree of None for a normal checkout.
        let here = Path::new(env!("CARGO_MANIFEST_DIR"));
        let identity = resolve_repo_identity(here).expect("must resolve inside a git repo");
        assert!(identity.canonical_root.join(".git").exists());
        assert!(!identity.slug.is_empty());
    }

    #[test]
    fn resolve_repo_identity_returns_none_outside_a_repo() {
        // The filesystem root is never inside a git repository.
        assert!(resolve_repo_identity(Path::new("/")).is_none());
    }
}
