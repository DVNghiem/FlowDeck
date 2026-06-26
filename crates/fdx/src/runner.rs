use anyhow::{Context, Result};
use std::process::{Command, Stdio};

/// Captured output from a subprocess execution.
#[derive(Debug, Clone)]
pub struct CommandOutput {
    /// Standard output from the command.
    pub stdout: String,
    /// Standard error from the command.
    pub stderr: String,
    /// Exit code from the command (0 if not available).
    pub exit_code: i32,
    /// Whether the command exited successfully.
    pub success: bool,
}

/// Run a program with the given arguments and capture its output.
///
/// Returns an error if the program is not found in PATH.
/// The exit code is preserved in `CommandOutput::exit_code`.
pub fn run(program: &str, args: &[&str]) -> Result<CommandOutput> {
    run_with_env(program, args, &[])
}

/// Run a program with arguments and additional environment variables.
///
/// `env` is a slice of `(key, value)` pairs to set in the subprocess environment.
/// Returns an error if the program is not found in PATH.
pub fn run_with_env(program: &str, args: &[&str], env: &[(&str, &str)]) -> Result<CommandOutput> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (key, value) in env {
        cmd.env(key, value);
    }

    let output = cmd.output().with_context(|| {
        format!("{} not found — install it or check your PATH", program)
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let exit_code = output.status.code().unwrap_or(0);
    let success = output.status.success();

    Ok(CommandOutput {
        stdout,
        stderr,
        exit_code,
        success,
    })
}
