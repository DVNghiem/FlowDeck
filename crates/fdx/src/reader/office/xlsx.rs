//! .xlsx parser: iterates sheets via calamine and renders each sheet as a
//! markdown table.

use std::path::Path;

/// Parse a .xlsx file and return its markdown rendering.
///
/// `warnings` collects non-fatal issues (truncated sheets, unsupported
/// features).
pub fn parse_xlsx(path: &Path, warnings: &mut Vec<String>) -> anyhow::Result<String> {
    warnings.push("xlsx parser is a stub — Task 4 will replace this body".to_string());
    Ok(format!("# {}\n", path.display()))
}
