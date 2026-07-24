//! `fdx context` — per-topic agent output log.
//!
//! Mirrors `src/tools/fdx-context.ts` (the deleted original). Three actions:
//! - `append` — append a single line under an advisory lock.
//! - `read`   — return the file contents, or "(context.md does not exist yet)".
//! - `clear`  — truncate the file (no-op if missing).

use std::fs;
use std::path::Path;

use crate::locking;
use crate::paths;

/// Cap a single appended summary to this many characters.
/// Matches `MAX_FIELD_LENGTH` in the deleted `src/tools/fdx-context.ts`.
pub const MAX_FIELD_LENGTH: usize = 2000;

/// Append action result.
pub fn append(
    home: &Path,
    project_slug: &str,
    topic: &str,
    agent: &str,
    stage: &str,
    summary: &str,
) -> Result<String, String> {
    if agent.is_empty() || stage.is_empty() || summary.is_empty() {
        return Err("agent, stage, and summary are required for action=append".to_string());
    }
    let summary = truncate(summary, MAX_FIELD_LENGTH);
    let line = format!(
        "[{}] [{}/{}] {}\n",
        chrono_like_iso_now(),
        stage,
        agent,
        summary
    );
    let path = paths::topic_context_path(home, project_slug, topic);
    locking::append_with_lock(&path, &line);
    Ok(format!("Appended context entry to {}", path.display()))
}

/// Read action: return file contents, or a "does not exist" placeholder.
pub fn read(home: &Path, project_slug: &str, topic: &str) -> Result<String, String> {
    let path = paths::topic_context_path(home, project_slug, topic);
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok("(context.md does not exist yet)".to_string())
        }
        Err(e) => Err(format!("failed to read {}: {}", path.display(), e)),
    }
}

/// Clear action: truncate the file. Idempotent — safe when missing.
pub fn clear(home: &Path, project_slug: &str, topic: &str) -> Result<String, String> {
    let path = paths::topic_context_path(home, project_slug, topic);
    let existed = path.exists();
    locking::clear_file_with_lock(&path);
    Ok(if existed {
        format!("Cleared {}", path.display())
    } else {
        format!("Clear: file did not exist (noop)")
    })
}

/// Truncate `s` to `max` chars, appending a marker. Mirrors the deleted
/// `truncate` helper in `src/tools/fdx-context.ts:11-14`.
fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    // Take `max - 14` chars then append the truncation marker. Total = 14 + (max - 14) = max.
    let keep: String = s.chars().take(max.saturating_sub(14)).collect();
    format!("{}… [truncated]", keep)
}

/// ISO 8601 UTC timestamp, no external `chrono` dependency (avoids Cargo.toml churn).
/// Format: `YYYY-MM-DDTHH:MM:SS.sssZ` (millisecond precision, UTC).
fn chrono_like_iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let ms = dur.subsec_millis();

    // Civil date from days since epoch (Howard Hinnant's algorithm, public domain).
    let days = (secs / 86_400) as i64;
    let secs_of_day = (secs % 86_400) as u32;
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    // Howard Hinnant's date algorithm.
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
    fn truncate_at_max() {
        let s = "a".repeat(5000);
        let t = truncate(&s, MAX_FIELD_LENGTH);
        assert!(t.ends_with("… [truncated]"));
        assert!(t.chars().count() <= MAX_FIELD_LENGTH);
    }

    #[test]
    fn truncate_under_max_unchanged() {
        let s = "short summary";
        assert_eq!(truncate(s, MAX_FIELD_LENGTH), s);
    }

    #[test]
    fn append_rejects_missing_fields() {
        let home = std::path::Path::new("/tmp");
        let result = append(home, "proj", "topic", "", "stage", "summary");
        assert!(result.is_err());
    }

    #[test]
    fn read_missing_returns_placeholder() {
        let home = std::env::temp_dir();
        let result = read(&home, "fdx-test-no-such-project", "no-such-topic");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "(context.md does not exist yet)");
    }
}
