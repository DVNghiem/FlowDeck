//! `fdx decisions` — per-topic design-decision log.
//!
//! Mirrors `src/tools/fdx-decisions.ts` (the deleted original). Two actions:
//! - `record` — append a markdown block (decision + rationale + made_by + timestamp).
//! - `read`   — return the file contents, or "(decisions.md does not exist yet)".

use std::fs;
use std::path::Path;

use crate::locking;
use crate::paths;

/// Cap a single decision/rationale/made_by field. Matches `MAX_FIELD_LENGTH`
/// in the deleted `src/tools/fdx-decisions.ts`.
pub const MAX_FIELD_LENGTH: usize = 2000;

/// Default `made_by` when not provided by the caller.
const DEFAULT_MADE_BY: &str = "orchestrator";

/// Strip control characters that would break the markdown block structure.
/// Each `## ...` block must stay single-line.
fn sanitize(text: &str) -> String {
    // Drop CR/LF/NUL — keeps the block on one line.
    let stripped: String = text
        .chars()
        .filter(|c| *c != '\r' && *c != '\n' && *c != '\0')
        .collect();
    // Cap at MAX_FIELD_LENGTH chars.
    stripped.chars().take(MAX_FIELD_LENGTH).collect()
}

/// Record action: append a decision block under an advisory lock.
pub fn record(
    home: &Path,
    project_slug: &str,
    topic: &str,
    decision: &str,
    rationale: &str,
    made_by: Option<&str>,
) -> Result<String, String> {
    if decision.is_empty() || rationale.is_empty() {
        return Err("decision and rationale are required for action=record".to_string());
    }
    let decision = sanitize(decision);
    let rationale = sanitize(rationale);
    let made_by = sanitize(made_by.unwrap_or(DEFAULT_MADE_BY));

    let block = format!(
        "## {}\n- **Rationale:** {}\n- **Made by:** {}\n- **At:** {}\n\n\n",
        decision,
        rationale,
        made_by,
        iso_now(),
    );

    let path = paths::topic_decisions_path(home, project_slug, topic);
    locking::append_with_lock(&path, &block);
    Ok(format!("Recorded decision to {}", path.display()))
}

/// Read action: return file contents, or a "does not exist" placeholder.
pub fn read(home: &Path, project_slug: &str, topic: &str) -> Result<String, String> {
    let path = paths::topic_decisions_path(home, project_slug, topic);
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok("(decisions.md does not exist yet)".to_string())
        }
        Err(e) => Err(format!("failed to read {}: {}", path.display(), e)),
    }
}

/// ISO 8601 UTC timestamp. Same shape as commands::context::chrono_like_iso_now
/// but inlined to keep modules self-contained.
fn iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let ms = dur.subsec_millis();

    let days = (secs / 86_400) as i64;
    let secs_of_day = (secs % 86_400) as u32;
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, m, d, hour, minute, second, ms
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_control_chars() {
        assert_eq!(sanitize("hello\r\nworld\0"), "helloworld");
        assert_eq!(sanitize("a\nb\rc\0d"), "abcd");
    }

    #[test]
    fn sanitize_caps_at_max() {
        let s = "a".repeat(5000);
        let result = sanitize(&s);
        assert_eq!(result.chars().count(), MAX_FIELD_LENGTH);
    }

    #[test]
    fn record_rejects_missing_fields() {
        let home = std::path::Path::new("/tmp");
        assert!(record(home, "proj", "topic", "", "rationale", None).is_err());
        assert!(record(home, "proj", "topic", "decision", "", None).is_err());
    }

    #[test]
    fn read_missing_returns_placeholder() {
        let home = std::env::temp_dir();
        let result = read(&home, "fdx-test-no-such-project", "no-such-topic");
        assert_eq!(result.unwrap(), "(decisions.md does not exist yet)");
    }
}
