use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn fdx_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../../target/release/fdx");
    path
}

#[test]
fn test_ls_current_dir() {
    let output = Command::new(fdx_bin())
        .args(["ls", ".", "--format", "text"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx ls failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("dirs/"), "should list directories: {}", stdout);
    assert!(stdout.contains("files"), "should list files: {}", stdout);
    assert!(output.status.success(), "fdx ls should succeed");
}

#[test]
fn test_ls_json_output() {
    let output = Command::new(fdx_bin())
        .args(["ls", ".", "--format", "json"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx ls failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("\"path\""), "JSON should have path field");
    assert!(stdout.contains("\"dirs\""), "JSON should have dirs field");
    assert!(stdout.contains("\"files\""), "JSON should have files field");
    assert!(output.status.success());
}

#[test]
fn test_ls_hidden_files() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("visible.txt"), "hello").unwrap();
    fs::write(temp.path().join(".hidden"), "secret").unwrap();

    // Without --all
    let output = Command::new(fdx_bin())
        .args(["ls", ".", "--format", "text"])
        .current_dir(temp.path())
        .output()
        .expect("fdx ls failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("visible.txt"), "should show visible file");
    assert!(!stdout.contains(".hidden"), "should not show hidden file");

    // With --all
    let output = Command::new(fdx_bin())
        .args(["ls", ".", "--all", "--format", "text"])
        .current_dir(temp.path())
        .output()
        .expect("fdx ls failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains(".hidden"), "should show hidden file with --all");
}

#[test]
fn test_ls_nonexistent_path() {
    let output = Command::new(fdx_bin())
        .args(["ls", "/nonexistent/path/12345"])
        .output()
        .expect("fdx ls failed");

    assert!(!output.status.success(), "should fail for nonexistent path");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Error"), "should show error: {}", stderr);
}
