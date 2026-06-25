use fdx::reader::grep;
use std::path::PathBuf;

#[test]
fn test_grep_basic() {
    let temp_dir = "/tmp/fdx_grep_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(
        &file,
        r#"
pub fn calculate_fee(amount: f64) -> f64 {
    amount * 0.05
}

pub fn calculate_tax(base: f64) -> f64 {
    base * 0.10
}
"#,
    )
    .unwrap();

    let (files, total_matches, truncated) =
        grep::grep_files("calculate", &[PathBuf::from(temp_dir)], 1, false, false, 50).unwrap();

    assert!(!files.is_empty());
    assert!(total_matches >= 2);
    assert!(!truncated);

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_grep_no_matches() {
    let temp_dir = "/tmp/fdx_grep_empty";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(&file, "fn foo() {}\n").unwrap();

    let (files, total_matches, _truncated) =
        grep::grep_files("nonexistent", &[PathBuf::from(temp_dir)], 1, false, false, 50)
            .unwrap();

    assert!(files.is_empty());
    assert_eq!(total_matches, 0);

    let _ = std::fs::remove_dir_all(temp_dir);
}
