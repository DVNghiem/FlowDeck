use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Save full command output to a tee file for later inspection.
///
/// Files are written to `.fdx/tee/<unix_timestamp>_<command_label>.log`
/// relative to the current working directory. The directory is created
/// if it does not exist.
///
/// Returns the path to the saved file, or an error if writing fails.
/// Callers should silently ignore tee errors — never crash because tee failed.
pub fn save_tee(command_label: &str, full_output: &str) -> Result<PathBuf> {
    let tee_dir = PathBuf::from(".fdx/tee");
    fs::create_dir_all(&tee_dir)?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let filename = format!("{}_{}.log", timestamp, sanitize_label(command_label));
    let path = tee_dir.join(filename);

    fs::write(&path, full_output)?;

    Ok(path)
}

/// Sanitize a command label for use in a filename.
/// Replaces non-alphanumeric characters with underscores.
fn sanitize_label(label: &str) -> String {
    label
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_label() {
        assert_eq!(sanitize_label("cargo_test"), "cargo_test");
        assert_eq!(sanitize_label("git diff"), "git_diff");
        assert_eq!(sanitize_label("pytest --verbose"), "pytest_--verbose");
    }
}
