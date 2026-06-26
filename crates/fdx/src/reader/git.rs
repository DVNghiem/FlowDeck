use crate::runner::{run, CommandOutput};
use anyhow::Result;

/// Run a git subcommand with token-optimized output.
///
/// Supported subcommands: status, log, diff, add, commit, push, pull, branch, show.
/// All other subcommands pass through to real git unchanged.
pub fn run_git(subcommand: &str, args: &[&str]) -> Result<CommandOutput> {
    match subcommand {
        "status" => git_status(args),
        "log" => git_log(args),
        "diff" => git_diff(args),
        "add" => git_add(args),
        "commit" => git_commit(args),
        "push" => git_push(args),
        "pull" => git_pull(args),
        "branch" => git_branch(args),
        "show" => git_show(args),
        _ => {
            // Pass through to real git
            let mut full_args = vec![subcommand];
            full_args.extend_from_slice(args);
            run("git", &full_args)
        }
    }
}

fn git_status(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["status", "--porcelain=v1"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    if output.stdout.trim().is_empty() {
        return Ok(CommandOutput {
            stdout: "clean\n".to_string(),
            stderr: output.stderr,
            exit_code: output.exit_code,
            success: output.success,
        });
    }

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for line in output.stdout.lines() {
        if line.len() < 3 {
            continue;
        }
        let status = &line[0..2];
        let file = &line[3..];

        if status.starts_with('?') {
            untracked.push(file.to_string());
        } else if status.starts_with(' ') {
            unstaged.push((status[1..].to_string(), file.to_string()));
        } else {
            staged.push((status[0..1].to_string(), file.to_string()));
        }
    }

    let mut result = String::new();
    if !staged.is_empty() {
        result.push_str(&format!("staged ({}):", staged.len()));
        for (status, file) in &staged {
            result.push_str(&format!("   {} {}", status, file));
        }
        result.push('\n');
    }
    if !unstaged.is_empty() {
        result.push_str(&format!("unstaged ({}):", unstaged.len()));
        for (status, file) in &unstaged {
            result.push_str(&format!("   {} {}", status, file));
        }
        result.push('\n');
    }
    if !untracked.is_empty() {
        result.push_str(&format!("untracked ({}):", untracked.len()));
        for file in &untracked {
            result.push_str(&format!("   {}", file));
        }
        result.push('\n');
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: output.stderr,
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn git_log(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["log", "--oneline", "--decorate"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    let lines: Vec<&str> = output.stdout.lines().collect();
    let cap = 20;
    let truncated = lines.len() > cap;
    let display_lines = if truncated { &lines[..cap] } else { &lines };

    let mut result = String::new();
    for line in display_lines {
        // Parse: <sha> <message> (<decorations>)
        if let Some(space_idx) = line.find(' ') {
            let sha = &line[..space_idx];
            let rest = &line[space_idx + 1..];
            result.push_str(&format!("{}  {}\n", sha, rest));
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }

    if truncated {
        result.push_str(&format!("[{} more commits]\n", lines.len() - cap));
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: output.stderr,
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn git_diff(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["diff"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    let filtered = filter_diff_output(&output.stdout);
    Ok(CommandOutput {
        stdout: filtered,
        stderr: output.stderr,
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn git_show(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["show"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    let filtered = filter_diff_output(&output.stdout);
    Ok(CommandOutput {
        stdout: filtered,
        stderr: output.stderr,
        exit_code: output.exit_code,
        success: output.success,
    })
}

fn filter_diff_output(stdout: &str) -> String {
    let mut result = String::new();
    let mut changed_lines = 0;
    const MAX_CHANGED_LINES: usize = 150;
    let mut file_changes: Vec<(String, usize)> = Vec::new();
    let mut current_file = String::new();
    let mut current_count = 0;

    for line in stdout.lines() {
        if line.starts_with("diff --git") {
            if !current_file.is_empty() && current_count > 0 {
                file_changes.push((current_file.clone(), current_count));
            }
            // Extract filename from "diff --git a/... b/..."
            if let Some(b_idx) = line.find(" b/") {
                current_file = line[b_idx + 3..].to_string();
            } else {
                current_file = line.to_string();
            }
            current_count = 0;
            continue;
        }
        if line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("mode ")
        {
            continue;
        }
        if line.starts_with("@@") && line.contains("@@") {
            result.push_str(line);
            result.push('\n');
            continue;
        }
        if line.starts_with('+') || line.starts_with('-') {
            if changed_lines >= MAX_CHANGED_LINES {
                current_count += 1;
                continue;
            }
            result.push_str(line);
            result.push('\n');
            changed_lines += 1;
            current_count += 1;
        }
    }

    if !current_file.is_empty() && current_count > 0 {
        file_changes.push((current_file, current_count));
    }

    if changed_lines >= MAX_CHANGED_LINES {
        result.push_str("[diff truncated — showing file list]\n");
        for (file, count) in file_changes {
            result.push_str(&format!("  {} ({} lines)\n", file, count));
        }
    }

    result
}

fn git_add(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["add"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    if output.success {
        Ok(CommandOutput {
            stdout: "ok\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        })
    } else {
        Ok(output)
    }
}

fn git_commit(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["commit"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    if output.success {
        // Extract short sha from output like "[main abc1234] message"
        let sha = output
            .stdout
            .lines()
            .next()
            .and_then(|line| {
                let start = line.find('[')?;
                let end = line.find(']')?;
                let inner = &line[start + 1..end];
                inner.split_whitespace().nth(1).map(|s| s.to_string())
            })
            .unwrap_or_default();

        Ok(CommandOutput {
            stdout: format!("ok {}\n", sha),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        })
    } else {
        Ok(output)
    }
}

fn git_push(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["push"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    if output.success {
        // Extract branch from output
        let branch = output
            .stdout
            .lines()
            .next()
            .and_then(|line| {
                if line.contains("->") {
                    line.split("->").nth(1).map(|s| s.trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "unknown".to_string());

        Ok(CommandOutput {
            stdout: format!("ok {}\n", branch),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        })
    } else {
        Ok(output)
    }
}

fn git_pull(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["pull"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    if output.stdout.contains("Already up to date")
        || output.stdout.contains("Already up-to-date")
    {
        return Ok(CommandOutput {
            stdout: "ok up-to-date\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        });
    }

    if output.success {
        // Parse summary line like " 3 files changed, 10 insertions(+), 2 deletions(-)"
        let summary = output
            .stdout
            .lines()
            .find(|line| {
                line.contains("files changed") || line.contains("file changed")
            })
            .unwrap_or("");

        let files = summary
            .split_whitespace()
            .next()
            .unwrap_or("0")
            .to_string();
        let added = summary
            .split("insertion")
            .next()
            .and_then(|s| s.split_whitespace().last())
            .unwrap_or("0")
            .to_string();
        let removed = summary
            .split("deletion")
            .next()
            .and_then(|s| s.split_whitespace().last())
            .unwrap_or("0")
            .to_string();

        Ok(CommandOutput {
            stdout: format!("ok {} files +{} -{}\n", files, added, removed),
            stderr: String::new(),
            exit_code: 0,
            success: true,
        })
    } else {
        Ok(output)
    }
}

fn git_branch(args: &[&str]) -> Result<CommandOutput> {
    let mut cmd_args = vec!["branch", "-vv"];
    cmd_args.extend_from_slice(args);
    let output = run("git", &cmd_args)?;

    let mut result = String::new();
    for line in output.stdout.lines() {
        if line.len() < 2 {
            continue;
        }
        let current = line.starts_with('*');
        let rest = if current { &line[2..] } else { &line[2..] };

        let parts: Vec<&str> = rest.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let branch_name = parts[0];
        let tracking = parts
            .iter()
            .find(|p| p.starts_with('['))
            .map(|p| p.trim_start_matches('[').trim_end_matches(']'))
            .unwrap_or("no remote");

        let prefix = if current { "*" } else { " " };
        result.push_str(&format!(
            "{} {} → {}\n",
            prefix, branch_name, tracking
        ));
    }

    Ok(CommandOutput {
        stdout: result,
        stderr: output.stderr,
        exit_code: output.exit_code,
        success: output.success,
    })
}
