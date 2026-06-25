use fdx::reader::code::cache::AstCache;
use fdx::reader::search;
use std::path::PathBuf;

#[test]
fn test_search_symbols() {
    let temp_dir = "/tmp/fdx_search_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file1 = format!("{}/foo.rs", temp_dir);
    std::fs::write(
        &file1,
        r#"
pub fn calculate_fee(amount: f64) -> f64 {
    amount * 0.05
}

pub struct Fee {
    pub amount: f64,
}
"#,
    )
    .unwrap();

    let file2 = format!("{}/bar.rs", temp_dir);
    std::fs::write(
        &file2,
        r#"
pub fn calculate_tax(base: f64) -> f64 {
    base * 0.10
}
"#,
    )
    .unwrap();

    let cache = AstCache::new();
    let matches = search::search_symbols(
        "calculate",
        &[PathBuf::from(temp_dir)],
        None,
        true,
        &cache,
    )
    .unwrap();

    assert_eq!(matches.len(), 2);
    let names: Vec<&str> = matches.iter().map(|m| m.symbol.name.as_str()).collect();
    assert!(names.contains(&"calculate_fee"));
    assert!(names.contains(&"calculate_tax"));

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_search_no_matches() {
    let temp_dir = "/tmp/fdx_search_empty";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(&file, "fn foo() {}\n").unwrap();

    let cache = AstCache::new();
    let matches = search::search_symbols(
        "nonexistent",
        &[PathBuf::from(temp_dir)],
        None,
        true,
        &cache,
    )
    .unwrap();

    assert!(matches.is_empty());

    let _ = std::fs::remove_dir_all(temp_dir);
}
