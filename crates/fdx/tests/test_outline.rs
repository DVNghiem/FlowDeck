use fdx::reader::code::cache::AstCache;
use fdx::reader::outline::{outline_paths, OutlineOptions};
use std::path::PathBuf;

#[test]
fn test_outline_basic() {
    let temp_dir = "/tmp/fdx_outline_test";
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

pub enum Status {
    Active,
    Inactive,
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
    let options = OutlineOptions::default();
    let results = outline_paths(&[PathBuf::from(temp_dir)],
        &options,
        &cache,
    )
    .unwrap();

    assert_eq!(results.len(), 2);

    let total_symbols: usize = results.iter().map(|r| r.symbols.len()).sum();
    assert_eq!(total_symbols, 4); // 3 in foo.rs + 1 in bar.rs

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_outline_kind_filter() {
    let temp_dir = "/tmp/fdx_outline_kind_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(
        &file,
        r#"
pub fn foo() {}
pub struct Bar {}
pub enum Baz {}
"#,
    )
    .unwrap();

    let cache = AstCache::new();
    let options = OutlineOptions {
        kind_filter: Some(vec!["function".to_string()]),
        ..OutlineOptions::default()
    };
    let results = outline_paths(&[PathBuf::from(temp_dir)],
        &options,
        &cache,
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].symbols.len(), 1);
    assert_eq!(results[0].symbols[0].name, "foo");

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_outline_min_lines_filter() {
    let temp_dir = "/tmp/fdx_outline_minlines_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(
        &file,
        r#"
pub fn short() {}

pub fn long() {
    let a = 1;
    let b = 2;
    let c = 3;
}
"#,
    )
    .unwrap();

    let cache = AstCache::new();
    let options = OutlineOptions {
        min_lines: 3,
        ..OutlineOptions::default()
    };
    let results = outline_paths(
        &[PathBuf::from(temp_dir)],
        &options,
        &cache,
    )
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].symbols.len(), 1);
    assert_eq!(results[0].symbols[0].name, "long");

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_outline_empty_dir() {
    let temp_dir = "/tmp/fdx_outline_empty_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let cache = AstCache::new();
    let options = OutlineOptions::default();
    let results = outline_paths(
        &[PathBuf::from(temp_dir)],
        &options,
        &cache,
    )
    .unwrap();

    assert!(results.is_empty());

    let _ = std::fs::remove_dir_all(temp_dir);
}
