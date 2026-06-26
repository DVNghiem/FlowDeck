use crate::runner::{run, CommandOutput};
use anyhow::{bail, Result};

/// Run a linter with token-optimized output.
///
/// Supported linters: ruff, clippy, tsc, eslint, biome, golangci, rubocop.
pub fn run_linter(linter: &str, args: &[String]) -> Result<CommandOutput> {
    let output = match linter {
        "ruff" => run_ruff(args)?,
        "clippy" => run_clippy(args)?,
        "tsc" => run_tsc(args)?,
        "eslint" => run_eslint(args)?,
        "biome" => run_biome(args)?,
        "golangci" => run_golangci(args)?,
        "rubocop" => run_rubocop(args)?,
        _ => bail!(
            "unsupported linter: {} (supported: ruff, clippy, tsc, eslint, biome, golangci, rubocop)",
            linter
        ),
    };

    let compressed = compress_lint_output(linter, &output)?;
    Ok(compressed)
}

fn run_ruff(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["check", "--output-format", "json"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("ruff", &cmd_args)
}

fn run_clippy(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["clippy", "--message-format", "json"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("cargo", &cmd_args)
}

fn run_tsc(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["--noEmit"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("tsc", &cmd_args)
}

fn run_eslint(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["--format", "json"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("eslint", &cmd_args)
}

fn run_biome(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["check", "--reporter=json"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("biome", &cmd_args)
}

fn run_golangci(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["run", "--out-format", "json"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("golangci-lint", &cmd_args)
}

fn run_rubocop(args: &[String]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["--format", "json"];
    let extra: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cmd_args.extend(extra);
    run("rubocop", &cmd_args)
}

/// Compress lint output to show findings grouped by file.
fn compress_lint_output(linter: &str, output: &CommandOutput) -> Result<CommandOutput> {
    match linter {
        "ruff" => compress_ruff_output(output),
        "clippy" => compress_clippy_output(output),
        "tsc" => compress_tsc_output(output),
        "eslint" => compress_eslint_output(output),
        "biome" => compress_biome_output(output),
        "golangci" => compress_golangci_output(output),
        "rubocop" => compress_rubocop_output(output),
        _ => Ok(output.clone()),
    }
}

fn compress_ruff_output(output: &CommandOutput) -> Result<CommandOutput> {
    if output.stdout.trim().is_empty() || output.stdout == "[]" {
        return Ok(CommandOutput {
            stdout: "ok  no issues\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    let findings: Vec<serde_json::Value> =
        serde_json::from_str(&output.stdout).unwrap_or_default();

    let mut result = format_findings("ruff", &findings, |f| {
        let file = f.get("filename").and_then(|v| v.as_str()).unwrap_or("unknown");
        let line = f.get("location").and_then(|l| l.get("row")).and_then(|v| v.as_u64()).unwrap_or(0);
        let code = f.get("code").and_then(|v| v.as_str()).unwrap_or("unknown");
        let msg = f.get("message").and_then(|v| v.as_str()).unwrap_or("");
        (file.to_string(), line as usize, code.to_string(), msg.to_string())
    });

    if result.is_empty() {
        result = "ok  no issues\n".to_string();
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn compress_clippy_output(output: &CommandOutput) -> Result<CommandOutput> {
    let mut findings = Vec::new();

    for line in output.stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let msg: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if msg.get("reason").and_then(|r| r.as_str()) != Some("compiler-message") {
            continue;
        }

        let level = msg
            .get("message")
            .and_then(|m| m.get("level"))
            .and_then(|l| l.as_str())
            .unwrap_or("");
        if level != "warning" && level != "error" {
            continue;
        }

        let file = msg
            .get("message")
            .and_then(|m| m.get("spans"))
            .and_then(|s| s.as_array())
            .and_then(|arr| arr.first())
            .and_then(|span| span.get("file_name"))
            .and_then(|f| f.as_str())
            .unwrap_or("unknown");
        let line_num = msg
            .get("message")
            .and_then(|m| m.get("spans"))
            .and_then(|s| s.as_array())
            .and_then(|arr| arr.first())
            .and_then(|span| span.get("line_start"))
            .and_then(|l| l.as_u64())
            .unwrap_or(0);
        let code = msg
            .get("message")
            .and_then(|m| m.get("code"))
            .and_then(|c| c.get("code"))
            .and_then(|v| v.as_str())
            .unwrap_or("clippy");
        let message = msg
            .get("message")
            .and_then(|m| m.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        findings.push((
            file.to_string(),
            line_num as usize,
            code.to_string(),
            message.to_string(),
        ));
    }

    let mut result = format_findings_vec("clippy", &findings);
    if result.is_empty() {
        result = "ok  no issues\n".to_string();
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn compress_tsc_output(output: &CommandOutput) -> Result<CommandOutput> {
    let mut findings = Vec::new();

    for line in output.stdout.lines() {
        // Pattern: file.ts(12,5): error TS2345: <message>
        if let Some(colon_idx) = line.find(": error TS") {
            let prefix = &line[..colon_idx];
            let rest = &line[colon_idx + 2..]; // skip ": "

            if let Some(paren_idx) = prefix.rfind('(') {
                let file = &prefix[..paren_idx];
                let loc = &prefix[paren_idx + 1..prefix.len() - 1]; // strip ()
                let line_num: usize = loc.split(',').next().unwrap_or("0").parse().unwrap_or(0);

                let code_end = rest.find(':').unwrap_or(rest.len());
                let code = &rest[..code_end];
                let msg = &rest[code_end.min(rest.len())..].trim_start_matches(": ");

                findings.push((file.to_string(), line_num, code.to_string(), msg.to_string()));
            }
        }
    }

    let mut result = format_findings_vec("tsc", &findings);
    if result.is_empty() {
        result = "ok  no issues\n".to_string();
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn compress_eslint_output(output: &CommandOutput) -> Result<CommandOutput> {
    if output.stdout.trim().is_empty() || output.stdout == "[]" {
        return Ok(CommandOutput {
            stdout: "ok  no issues\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    let files: Vec<serde_json::Value> =
        serde_json::from_str(&output.stdout).unwrap_or_default();

    let mut all_findings = Vec::new();
    for file in files {
        let path = file.get("filePath").and_then(|v| v.as_str()).unwrap_or("unknown");
        if let Some(messages) = file.get("messages").and_then(|v| v.as_array()) {
            for msg in messages {
                let line = msg.get("line").and_then(|v| v.as_u64()).unwrap_or(0);
                let code = msg.get("ruleId").and_then(|v| v.as_str()).unwrap_or("unknown");
                let message = msg.get("message").and_then(|v| v.as_str()).unwrap_or("");
                all_findings.push((
                    path.to_string(),
                    line as usize,
                    code.to_string(),
                    message.to_string(),
                ));
            }
        }
    }

    let mut result = format_findings_vec("eslint", &all_findings);
    if result.is_empty() {
        result = "ok  no issues\n".to_string();
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn compress_biome_output(output: &CommandOutput) -> Result<CommandOutput> {
    // Biome JSON format is similar to eslint
    compress_eslint_output(output)
}

fn compress_golangci_output(output: &CommandOutput) -> Result<CommandOutput> {
    let data: serde_json::Value = serde_json::from_str(&output.stdout).unwrap_or_default();
    let mut all_findings = Vec::new();

    if let Some(issues) = data.get("Issues").and_then(|v| v.as_array()) {
        for issue in issues {
            let file = issue
                .get("Pos")
                .and_then(|p| p.get("Filename"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let line = issue
                .get("Pos")
                .and_then(|p| p.get("Line"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let code = issue
                .get("FromLinter")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let msg = issue
                .get("Text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            all_findings.push((
                file.to_string(),
                line as usize,
                code.to_string(),
                msg.to_string(),
            ));
        }
    }

    let mut result = format_findings_vec("golangci", &all_findings);
    if result.is_empty() {
        result = "ok  no issues\n".to_string();
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn compress_rubocop_output(output: &CommandOutput) -> Result<CommandOutput> {
    let data: serde_json::Value = serde_json::from_str(&output.stdout).unwrap_or_default();
    let mut all_findings = Vec::new();

    if let Some(files) = data.get("files").and_then(|v| v.as_array()) {
        for file in files {
            let path = file.get("path").and_then(|v| v.as_str()).unwrap_or("unknown");
            if let Some(offenses) = file.get("offenses").and_then(|v| v.as_array()) {
                for offense in offenses {
                    let line = offense
                        .get("location")
                        .and_then(|l| l.get("line"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let code = offense
                        .get("cop_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    let msg = offense
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    all_findings.push((
                        path.to_string(),
                        line as usize,
                        code.to_string(),
                        msg.to_string(),
                    ));
                }
            }
        }
    }

    let mut result = format_findings_vec("rubocop", &all_findings);
    if result.is_empty() {
        result = "ok  no issues\n".to_string();
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: String::new(),
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn format_findings<F>(
    _linter: &str,
    findings: &[serde_json::Value],
    extractor: F,
) -> String
where
    F: Fn(&serde_json::Value) -> (String, usize, String, String),
{
    let mut extracted: Vec<(String, usize, String, String)> =
        findings.iter().map(extractor).collect();
    extracted.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    format_findings_vec(_linter, &extracted)
}

fn format_findings_vec(
    _linter: &str,
    findings: &[(String, usize, String, String)],
) -> String {
    if findings.is_empty() {
        return String::new();
    }

    let mut result = String::new();
    let mut current_file = String::new();
    let mut file_count = 0;
    let mut total_count = 0;

    const MAX_FINDINGS: usize = 80;
    let truncated = findings.len() > MAX_FINDINGS;
    let display = if truncated {
        &findings[..MAX_FINDINGS]
    } else {
        findings
    };

    for (file, line, code, msg) in display {
        if file != &current_file {
            if !current_file.is_empty() {
                result.push('\n');
            }
            current_file = file.clone();
            file_count += 1;
        }
        result.push_str(&format!("  {}:{}  {}  {}\n", file, line, code, msg));
        total_count += 1;
    }

    result.push_str(&format!("\n{} issues across {} files\n", total_count, file_count));

    if truncated {
        result.push_str(&format!(
            "[{} more findings not shown]\n",
            findings.len() - MAX_FINDINGS
        ));
    }

    result
}
