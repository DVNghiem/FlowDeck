use std::path::PathBuf;
use std::process::Command;

fn fdx_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../../target/release/fdx");
    path
}

#[test]
fn test_git_status() {
    let output = Command::new(fdx_bin())
        .args(["git", "status"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx git status failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Should show either clean or some status groups
    assert!(
        stdout.contains("clean") || stdout.contains("staged") || stdout.contains("unstaged"),
        "should show status: {}",
        stdout
    );
    assert!(output.status.success());
}

#[test]
fn test_git_log() {
    let output = Command::new(fdx_bin())
        .args(["git", "log", "-n", "3"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx git log failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Should show commit SHAs (7 hex chars)
    assert!(stdout.len() > 20, "should have log output: {}", stdout);
    assert!(output.status.success());
}

#[test]
fn test_git_branch() {
    let output = Command::new(fdx_bin())
        .args(["git", "branch"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx git branch failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("main"), "should show main branch: {}", stdout);
    assert!(output.status.success());
}

#[test]
fn test_git_pass_through() {
    // Test that unknown subcommands pass through
    let output = Command::new(fdx_bin())
        .args(["git", "config", "--list"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx git config failed");

    assert!(output.status.success(), "git config should succeed");
}
