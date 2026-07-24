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
}
