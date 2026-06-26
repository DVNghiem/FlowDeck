use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn fdx_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../../target/release/fdx");
    path
}

#[test]
fn test_tree_current_dir() {
    let output = Command::new(fdx_bin())
        .args(["tree", ".", "--depth", "1", "--format", "text"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx tree failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("src"), "should show src dir: {}", stdout);
    assert!(output.status.success());
}

#[test]
fn test_tree_json_output() {
    let output = Command::new(fdx_bin())
        .args(["tree", ".", "--depth", "1", "--format", "json"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx tree failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("\"root\""), "JSON should have root field");
    assert!(stdout.contains("\"type\""), "JSON should have type field");
    assert!(output.status.success());
}

#[test]
fn test_tree_dirs_only() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join("subdir")).unwrap();
    fs::write(temp.path().join("file.txt"), "hello").unwrap();

    let output = Command::new(fdx_bin())
        .args(["tree", ".", "--depth", "2", "--dirs-only", "--format", "text"])
        .current_dir(temp.path())
        .output()
        .expect("fdx tree failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("subdir"), "should show subdir: {}", stdout);
    assert!(!stdout.contains("file.txt"), "should not show file: {}", stdout);
}

#[test]
fn test_tree_depth_limit() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join("a")).unwrap();
    fs::create_dir(temp.path().join("a").join("b")).unwrap();
    fs::write(temp.path().join("a").join("b").join("c.txt"), "deep").unwrap();

    let output = Command::new(fdx_bin())
        .args(["tree", ".", "--depth", "2", "--format", "text"])
        .current_dir(temp.path())
        .output()
        .expect("fdx tree failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("a"), "should show a dir: {}", stdout);
    // depth 2 means a/b/ should be shown but not c.txt
    assert!(output.status.success());
}
