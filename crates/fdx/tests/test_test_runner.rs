use std::path::PathBuf;
use std::process::Command;

fn fdx_bin() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../../target/release/fdx");
    path
}

#[test]
fn test_test_cargo() {
    let output = Command::new(fdx_bin())
        .args(["test", "cargo"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx test cargo failed");

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Should show ok or FAILED summary
    assert!(
        stdout.contains("ok") || stdout.contains("FAILED"),
        "should show test result: {}",
        stdout
    );
}

#[test]
fn test_test_unsupported_runner() {
    let output = Command::new(fdx_bin())
        .args(["test", "unknown_runner"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("fdx test failed");

    assert!(!output.status.success(), "should fail for unsupported runner");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("unsupported"), "should show unsupported error: {}", stderr);
}
