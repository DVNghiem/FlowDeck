use crate::runner::{run, CommandOutput};
use crate::tee::save_tee;
use anyhow::{bail, Result};

/// Run tests with the specified runner and token-optimized output.
///
/// Supported runners: cargo, pytest, jest, vitest, go, rspec, rails.
pub fn run_tests(runner: &str, args: &[String]) -> Result<CommandOutput> {
    let output = match runner {
        "cargo" => run_cargo_test(args)?,
        "pytest" => run_pytest(args)?,
        "jest" => run_jest(args)?,
        "vitest" => run_vitest(args)?,
        "go" => run_go_test(args)?,
        "rspec" => run_rspec(args)?,
        "rails" => run_rails_test(args)?,
        _ => bail!(
            "unsupported test runner: {} (supported: cargo, pytest, jest, vitest, go, rspec, rails)",
            runner
        ),
    };

    let compressed = compress_test_output(runner, &output)?;
    Ok(compressed)
}

fn run_cargo_test(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["test"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("cargo", &cmd_args)
}

fn run_pytest(args: &[String]) -> Result<CommandOutput> {
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run("pytest", &extra)
}

fn run_jest(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["--no-coverage"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("jest", &cmd_args)
}

fn run_vitest(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["run"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("vitest", &cmd_args)
}

fn run_go_test(args: &[String]) -> Result<CommandOutput> {
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run("go", &std::iter::once("test").chain(extra.iter().copied()).collect::<Vec<_>>())
}

fn run_rspec(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["--format", "json"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("rspec", &cmd_args)
}

fn run_rails_test(args: &[String]) -> Result<CommandOutput> {
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run("rails", &std::iter::once("test").chain(extra.iter().copied()).collect::<Vec<_>>())
}

/// Compress test output to show failures only.
fn compress_test_output(runner: &str, output: &CommandOutput) -> Result<CommandOutput> {
    let combined = format!("{}\n{}", output.stdout, output.stderr);

    match runner {
        "cargo" => compress_cargo_output(output, &combined),
        "pytest" => compress_pytest_output(output, &combined),
        "jest" => compress_jest_output(output, &combined),
        "vitest" => compress_vitest_output(output, &combined),
        "go" => compress_go_output(output, &combined),
        "rspec" => compress_rspec_output(output, &combined),
        "rails" => compress_rails_output(output, &combined),
        _ => Ok(output.clone()),
    }
}

fn compress_cargo_output(original: &CommandOutput, combined: &str) -> Result<CommandOutput> {
    // Check if all passed
    if original.success {
        let count = count_cargo_tests(combined);
        return Ok(CommandOutput {
            stdout: format!("ok  {} tests passed\n", count),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    // Extract failures
    let mut failures = Vec::new();
    let mut in_failure = false;
    let mut current_failure = String::new();
    let mut current_name = String::new();

    for line in combined.lines() {
        if line.starts_with("test ") && line.contains(" ... FAILED") {
            if in_failure && !current_failure.is_empty() {
                failures.push((current_name.clone(), current_failure.clone()));
            }
            in_failure = true;
            current_name = line
                .trim_start_matches("test ")
                .trim_end_matches(" ... FAILED")
                .to_string();
            current_failure = format!("{}\n", line);
        } else if in_failure {
            if line.starts_with("---- ") && line.contains(" stdout ----") {
                // Start of failure detail
                current_failure.push_str(line);
                current_failure.push('\n');
            } else if line.starts_with("---- ") && line.contains(" stderr ----") {
                // End of this failure block
                failures.push((current_name.clone(), current_failure.clone()));
                in_failure = false;
                current_failure.clear();
            } else if line.starts_with("test result:") {
                // End of all tests
                if !current_failure.is_empty() {
                    failures.push((current_name.clone(), current_failure.clone()));
                }
                in_failure = false;
            } else {
                current_failure.push_str(line);
                current_failure.push('\n');
            }
        }
    }

    if failures.is_empty() {
        // Couldn't parse failures, return raw
        return Ok(original.clone());
    }

    let mut result = String::new();
    for (name, detail) in &failures {
        result.push_str(&format!("FAIL  {}\n", name));
        // Limit detail to first 20 lines
        let lines: Vec<&str> = detail.lines().collect();
        let capped = if lines.len() > 20 {
            &lines[..20]
        } else {
            &lines
        };
        for line in capped {
            result.push_str(line);
            result.push('\n');
        }
        if lines.len() > 20 {
            result.push_str("  [...truncated]\n");
        }
        result.push('\n');
    }

    let total = count_cargo_tests(combined);
    let failed = failures.len();
    result.push_str(&format!("FAILED  {}/{} tests\n", failed, total));

    // Hard cap: 100 lines
    let result_lines: Vec<&str> = result.lines().collect();
    let (final_output, truncated) = if result_lines.len() > 100 {
        let capped = result_lines[..100].join("\n");
        (capped + "\n", true)
    } else {
        (result, false)
    };

    if truncated {
        if let Ok(tee_path) = save_tee("cargo_test", &final_output) {
            let mut with_tee = final_output;
            with_tee.push_str(&format!("[full output saved: {}]\n", tee_path.display()));
            return Ok(CommandOutput {
                stdout: with_tee,
                stderr: String::new(),
                exit_code: original.exit_code,
                success: false,
            });
        }
    }

    Ok(CommandOutput {
        stdout: final_output,
        stderr: String::new(),
        exit_code: original.exit_code,
        success: false,
    })
}

fn count_cargo_tests(output: &str) -> usize {
    output
        .lines()
        .find(|line| line.starts_with("test result:"))
        .and_then(|line| {
            // Parse: "test result: ok. 2 passed; 0 failed; ..."
            // or: "test result: FAILED. 1 passed; 2 failed; ..."
            let parts: Vec<&str> = line.split_whitespace().collect();
            for (i, part) in parts.iter().enumerate() {
                if *part == "passed;" || *part == "passed." {
                    return parts.get(i.saturating_sub(1))
                        .and_then(|s| s.parse().ok());
                }
            }
            None
        })
        .unwrap_or(0)
}

fn compress_pytest_output(original: &CommandOutput, combined: &str) -> Result<CommandOutput> {
    if original.success {
        return Ok(CommandOutput {
            stdout: "ok  all tests passed\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    // Extract FAILED lines and short test summary
    let mut failures = Vec::new();
    let mut in_summary = false;

    for line in combined.lines() {
        if line.contains("short test summary info") {
            in_summary = true;
        }
        if in_summary && line.starts_with("FAILED") {
            failures.push(line.to_string());
        }
    }

    let mut result = failures.join("\n");
    result.push('\n');
    result.push_str("FAILED  pytest\n");

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: original.exit_code,
        success: false,
    })
}

fn compress_jest_output(original: &CommandOutput, combined: &str) -> Result<CommandOutput> {
    if original.success {
        return Ok(CommandOutput {
            stdout: "ok  all tests passed\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    let mut failures = Vec::new();
    for line in combined.lines() {
        if line.starts_with('✕') || line.contains("FAIL") {
            failures.push(line.to_string());
        }
    }

    let mut result = failures.join("\n");
    result.push('\n');
    result.push_str("FAILED  jest\n");

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: original.exit_code,
        success: false,
    })
}

fn compress_vitest_output(original: &CommandOutput, combined: &str) -> Result<CommandOutput> {
    if original.success {
        return Ok(CommandOutput {
            stdout: "ok  all tests passed\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    let mut failures = Vec::new();
    for line in combined.lines() {
        if line.starts_with('×') || line.contains("FAIL") {
            failures.push(line.to_string());
        }
    }

    let mut result = failures.join("\n");
    result.push('\n');
    result.push_str("FAILED  vitest\n");

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: original.exit_code,
        success: false,
    })
}

fn compress_go_output(original: &CommandOutput, combined: &str) -> Result<CommandOutput> {
    if original.success {
        return Ok(CommandOutput {
            stdout: "ok  all tests passed\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    let mut failures = Vec::new();
    let mut in_failure = false;

    for line in combined.lines() {
        if line.starts_with("--- FAIL:") {
            in_failure = true;
            failures.push(line.to_string());
        } else if in_failure {
            if line.starts_with("---") || line.is_empty() {
                in_failure = false;
            } else {
                failures.push(line.to_string());
            }
        }
    }

    let mut result = failures.join("\n");
    result.push('\n');
    result.push_str("FAILED  go test\n");

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: original.exit_code,
        success: false,
    })
}

fn compress_rspec_output(original: &CommandOutput, _combined: &str) -> Result<CommandOutput> {
    if original.success {
        return Ok(CommandOutput {
            stdout: "ok  all tests passed\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    // rspec --format json output
    let mut failures = Vec::new();
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&original.stdout) {
        if let Some(examples) = json.get("examples").and_then(|v| v.as_array()) {
            for ex in examples {
                if ex.get("status")
                    .and_then(|s| s.as_str())
                    == Some("failed")
                {
                    let desc = ex
                        .get("description")
                        .and_then(|d| d.as_str())
                        .unwrap_or("unknown");
                    let msg = ex
                        .get("exception")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("no message");
                    let file = ex
                        .get("file_path")
                        .and_then(|f| f.as_str())
                        .unwrap_or("unknown");
                    let line = ex
                        .get("line_number")
                        .and_then(|l| l.as_u64())
                        .unwrap_or(0);
                    failures.push(format!(
                        "FAIL  {}\n  {}:{}\n  {}\n",
                        desc, file, line, msg
                    ));
                }
            }
        }
    }

    let mut result = failures.join("\n");
    result.push_str("FAILED  rspec\n");

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: original.exit_code,
        success: false,
    })
}

fn compress_rails_output(original: &CommandOutput, combined: &str) -> Result<CommandOutput> {
    // Rails test output is similar to minitest
    compress_go_output(original, combined)
}
