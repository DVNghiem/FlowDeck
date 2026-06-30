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

#[test]
fn test_grep_max_matches_ceiling() {
    let temp_dir = "/tmp/fdx_grep_max_matches";
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

    // Request far more than the absolute ceiling; should be clamped to 200.
    let (files, total_matches, truncated) =
        grep::grep_files("calculate", &[PathBuf::from(temp_dir)], 1, false, false, 10_000)
            .unwrap();

    assert!(!files.is_empty());
    assert_eq!(total_matches, 2);
    assert!(!truncated);

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_grep_context_ceiling() {
    let temp_dir = "/tmp/fdx_grep_context";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(
        &file,
        r#"line1
line2
line3
line4
line5
pub fn target() {}
line7
line8
line9
line10
"#,
    )
    .unwrap();

    // Request 10 context lines; should be clamped to 3.
    let (files, _total_matches, _truncated) =
        grep::grep_files("target", &[PathBuf::from(temp_dir)], 10, false, false, 50).unwrap();

    assert!(!files.is_empty());
    let first_file = files.first().unwrap();
    let first_match = first_file.matches.first().unwrap();
    assert!(first_match.context_before.len() <= 3);
    assert!(first_match.context_after.len() <= 3);

    let _ = std::fs::remove_dir_all(temp_dir);
}
