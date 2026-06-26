use std::path::PathBuf;
use std::process::Command;

fn fdx_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../../target/release/fdx");
    path
}

#[test]
fn test_lint_clippy() {
    let output = Command::new(fdx_bin())
        .args(["lint", "clippy"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx lint clippy failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Should show findings or "ok no issues"
    assert!(
        stdout.contains("issues across") || stdout.contains("ok  no issues"),
        "should show lint result: {}",
        stdout
    );
}

#[test]
fn test_lint_unsupported() {
    let output = Command::new(fdx_bin())
        .args(["lint", "unknown_linter"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx lint failed");

    assert!(!output.status.success(), "should fail for unsupported linter");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("unsupported"), "should show unsupported error: {}", stderr);
}
