use fdx::reader::code::cache::AstCache;
use fdx::reader::impact;
use std::path::{Path, PathBuf};

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
