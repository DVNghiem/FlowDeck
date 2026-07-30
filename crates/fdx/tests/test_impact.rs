use fdx::reader::code::cache::AstCache;
use fdx::reader::impact;
use std::path::{Path, PathBuf};

/// Unique temp dir per test. A shared fixed path passes in isolation and fails
/// when tests run together, because the first writer leaves state behind.
fn temp_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("fdx-impact-{}-{}", label, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir must be creatable");
    dir
}

/// Resolved outbound dependency file names, for order-independent assertions.
fn outbound_files(results: &[impact::ImpactResult]) -> Vec<String> {
    let mut names: Vec<String> = results
        .iter()
        .flat_map(|r| r.outbound.iter())
        .filter_map(|d| d.path.as_deref())
        .filter_map(|p| Path::new(p).file_name().and_then(|n| n.to_str()))
        .map(|s| s.to_string())
        .collect();
    names.sort();
    names.dedup();
    names
}

fn analyze_out(target: &Path, root: &Path) -> Vec<impact::ImpactResult> {
    let cache = AstCache::new();
    impact::analyze_impact(
        &[target.to_path_buf()],
        root,
        1,
        impact::ImpactDirection::Out,
        &cache,
    )
    .expect("impact analysis must succeed")
}

/// Single-quoted import specifiers must resolve.
///
/// The line-based extractor located the specifier with `rfind('"')`, so a
/// codebase formatted with single quotes produced ZERO import edges. FlowDeck's
/// own source uses double quotes, which is why this went unnoticed.
#[test]
fn single_quoted_imports_are_found() {
    let dir = temp_dir("singlequote");
    std::fs::write(dir.join("b.ts"), "export function bee(): number { return 1; }\n").unwrap();
    let a = dir.join("a.ts");
    std::fs::write(
        &a,
        "import { bee } from './b';\n\nexport function ay(): number { return bee(); }\n",
    )
    .unwrap();

    let results = analyze_out(&a, &dir);
    assert_eq!(
        outbound_files(&results),
        vec!["b.ts".to_string()],
        "single-quoted import did not resolve"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// Multi-line import blocks must resolve.
///
/// The line-based extractor required `import` and `from` on the SAME line, so the
/// very common multi-line form was skipped entirely.
#[test]
fn multiline_imports_are_found() {
    let dir = temp_dir("multiline");
    std::fs::write(
        dir.join("b.ts"),
        "export function bee(): number { return 1; }\nexport function cee(): number { return 2; }\n",
    )
    .unwrap();
    let a = dir.join("a.ts");
    std::fs::write(
        &a,
        "import {\n  bee,\n  cee,\n} from \"./b\";\n\nexport function ay(): number { return bee() + cee(); }\n",
    )
    .unwrap();

    let results = analyze_out(&a, &dir);
    assert_eq!(
        outbound_files(&results),
        vec!["b.ts".to_string()],
        "multi-line import did not resolve"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// `export { x } from './y'` is a dependency edge too.
#[test]
fn reexport_imports_are_found() {
    let dir = temp_dir("reexport");
    std::fs::write(dir.join("b.ts"), "export function bee(): number { return 1; }\n").unwrap();
    let a = dir.join("a.ts");
    std::fs::write(&a, "export { bee } from './b';\n").unwrap();

    let results = analyze_out(&a, &dir);
    assert_eq!(
        outbound_files(&results),
        vec!["b.ts".to_string()],
        "re-export did not resolve"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn test_impact_rust_imports() {
    let temp_dir = "/tmp/fdx_impact_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let fee_file = format!("{}/fee.rs", temp_dir);
    std::fs::write(
        &fee_file,
        r#"
pub struct Fee {
    pub amount: f64,
}
"#,
    )
    .unwrap();

    let processor_file = format!("{}/processor.rs", temp_dir);
    std::fs::write(
        &processor_file,
        r#"
use crate::fee::Fee;

pub fn process(fee: Fee) -> f64 {
    fee.amount
}
"#,
    )
    .unwrap();

    let cache = AstCache::new();
    let results = impact::analyze_impact(
        &[PathBuf::from(&processor_file)],
        Path::new(temp_dir),
        1,
        impact::ImpactDirection::Both,
        &cache,
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    // Outbound: processor.rs imports fee.rs (use crate::fee::Fee)
    assert!(!results[0].outbound.is_empty() || !results[0].inbound.is_empty());

    let _ = std::fs::remove_dir_all(temp_dir);
}
