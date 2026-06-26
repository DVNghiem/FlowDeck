use fdx::reader::code::cache::AstCache;
use fdx::reader::diff::{diff_against, DiffOptions, FileStatus};
use std::path::PathBuf;

fn setup_git_repo(temp_dir: &str) {
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    // Init git repo
    let output = std::process::Command::new("git")
        .args(["init"])
        .current_dir(temp_dir)
        .output()
        .expect("git init failed");
    assert!(output.status.success(), "git init failed: {}", String::from_utf8_lossy(&output.stderr));

    // Configure git user
    std::process::Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(temp_dir)
        .output()
        .unwrap();
    std::process::Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(temp_dir)
        .output()
        .unwrap();

    // Create initial file and commit
    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(
        &file,
        r#"pub fn original() -> i32 {
    42
}
"#,
    )
    .unwrap();

    std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(temp_dir)
        .output()
        .unwrap();
    std::process::Command::new("git")
        .args(["commit", "-m", "initial"])
        .current_dir(temp_dir)
        .output()
        .unwrap();
}

#[test]
fn test_diff_modified_file() {
    let temp_dir = "/tmp/fdx_diff_test";
    setup_git_repo(temp_dir);

    // Modify the file
    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(
        &file,
        r#"pub fn original() -> i32 {
    42
}

pub fn new_function() -> i32 {
    100
}
"#,
    )
    .unwrap();

    let cache = AstCache::new();
    let options = DiffOptions {
        commit: "HEAD".to_string(),
        staged: false,
        paths: vec![PathBuf::from("test.rs")],
        no_cache: true,
        root: PathBuf::from(temp_dir),
    };

    let results = diff_against(&options, &cache).unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].status, FileStatus::Modified);
    assert_eq!(results[0].path, "test.rs");

    // Should have the new function as a symbol change
    let has_new_function = results[0].symbol_changes.iter().any(|sc| sc.name == "new_function");
    assert!(has_new_function, "Expected new_function in symbol changes");

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_diff_no_changes() {
    let temp_dir = "/tmp/fdx_diff_nochange_test";
    setup_git_repo(temp_dir);

    // No changes
    let cache = AstCache::new();
    let options = DiffOptions {
        commit: "HEAD".to_string(),
        staged: false,
        paths: vec![],
        no_cache: true,
        root: PathBuf::from(temp_dir),
    };

    let results = diff_against(&options, &cache).unwrap();
    assert!(results.is_empty());

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_diff_not_git_repo() {
    let temp_dir = "/tmp/fdx_diff_nogit_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let cache = AstCache::new();
    let options = DiffOptions {
        commit: "HEAD".to_string(),
        staged: false,
        paths: vec![],
        no_cache: true,
        root: PathBuf::from(temp_dir),
    };

    let result = diff_against(&options, &cache);
    assert!(result.is_err());
    let err_msg = result.unwrap_err().to_string();
    assert!(err_msg.contains("not a git repository"), "Expected git repo error, got: {}", err_msg);

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_diff_staged_changes() {
    let temp_dir = "/tmp/fdx_diff_staged_test";
    setup_git_repo(temp_dir);

    // Modify and stage
    let file = format!("{}/test.rs", temp_dir);
    std::fs::write(
        &file,
        r#"pub fn original() -> i32 {
    42
}

pub fn staged_fn() {}
"#,
    )
    .unwrap();

    std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(temp_dir)
        .output()
        .unwrap();

    let cache = AstCache::new();
    let options = DiffOptions {
        commit: "HEAD".to_string(),
        staged: true,
        paths: vec![],
        no_cache: true,
        root: PathBuf::from(temp_dir),
    };

    let results = diff_against(&options, &cache).unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].status, FileStatus::Modified);

    let _ = std::fs::remove_dir_all(temp_dir);
}
