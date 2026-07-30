use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process;

use fdx::output::{json, text, OutputFormat};
use fdx::reader::batch;
use fdx::reader::code::cache::AstCache;
use fdx::reader::grep;
use fdx::reader::impact::{self, ImpactDirection};
use fdx::reader::search;
use fdx::reader::{read_file, ReadMode, ReaderOptions};

#[derive(Parser)]
#[command(name = "fdx")]
#[command(about = "FlowDeck token-optimized file reader")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Read a file with token-optimized output
    ///
    /// Example: fdx read src/main.rs --mode prototype
    Read {
        /// Path to the file to read
        file: PathBuf,

        /// Read mode: auto, raw, prototype, deep
        #[arg(long, default_value = "auto")]
        mode: String,

        /// Target symbol for deep mode
        #[arg(long)]
        symbol: Option<String>,

        /// Max lines to return (text mode only)
        #[arg(long)]
        limit: Option<usize>,

        /// Start line, 1-indexed (text mode only)
        #[arg(long, default_value = "1")]
        offset: usize,

        /// Pull related symbols in deep mode
        #[arg(long, default_value = "true", action = clap::ArgAction::Set)]
        with_deps: bool,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,

        /// Bypass session AST cache
        #[arg(long)]
        no_cache: bool,
    },

    /// Search for symbols by name across files or directories
    ///
    /// Example: fdx search calculate_fee src/
    Search {
        /// Pattern to search for (case-insensitive substring match)
        pattern: String,

        /// Paths to search (files or directories)
        paths: Vec<PathBuf>,

        /// Filter by symbol kind: function, class, struct, trait, interface, enum, any
        #[arg(long, default_value = "any")]
        kind: String,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,

        /// Bypass session AST cache
        #[arg(long)]
        no_cache: bool,
    },

    /// Token-optimized grep with regex search
    ///
    /// Example: fdx grep "fn calculate" src/ --context 2
    Grep {
        /// Pattern to search for
        pattern: String,

        /// Paths to search (files or directories)
        paths: Vec<PathBuf>,

        /// Lines of context around each match
        #[arg(long, default_value = "2")]
        context: usize,

        /// Treat pattern as literal string, not regex
        #[arg(long)]
        fixed_strings: bool,

        /// Case-sensitive search
        #[arg(long)]
        case_sensitive: bool,

        /// Hard cap on total matches returned
        #[arg(long, default_value = "50")]
        max_matches: usize,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,
    },

    /// Read multiple files in one call
    ///
    /// Example: fdx batch "src/*.rs" --mode prototype
    Batch {
        /// Files or glob patterns to read
        patterns: Vec<String>,

        /// Read mode: prototype, deep, raw
        #[arg(long, default_value = "prototype")]
        mode: String,

        /// Target symbol for deep mode
        #[arg(long)]
        symbol: Option<String>,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,

        /// Bypass session AST cache
        #[arg(long)]
        no_cache: bool,

        /// Hard cap on number of files
        #[arg(long, default_value = "20")]
        max_files: usize,
    },

    /// Lightweight cross-file dependency analysis
    ///
    /// Example: fdx impact src/payment/fee.rs --direction both
    Impact {
        /// Target files to analyze
        files: Vec<PathBuf>,

        /// How many hops to follow
        #[arg(long, default_value = "1")]
        depth: usize,

        /// Direction: in, out, both
        #[arg(long, default_value = "both")]
        direction: String,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,

        /// Project root for resolving imports
        #[arg(long, default_value = ".")]
        root: PathBuf,
    },

    /// Token-optimized directory listing
    ///
    /// Example: fdx ls src/ --all
    Ls {
        /// Path to list (default: current directory)
        path: Option<PathBuf>,

        /// Include hidden files
        #[arg(short, long)]
        all: bool,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,
    },

    /// Compact directory tree, gitignore-aware
    ///
    /// Example: fdx tree src/ --depth 2
    Tree {
        /// Path to tree (default: current directory)
        path: Option<PathBuf>,

        /// Max depth (default: 3)
        #[arg(long, default_value = "3")]
        depth: usize,

        /// Show directories only
        #[arg(long)]
        dirs_only: bool,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,
    },

    /// Token-optimized git subcommands
    ///
    /// Example: fdx git status
    Git {
        /// Git subcommand and arguments
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Failures-only test runner wrapper
    ///
    /// Example: fdx test cargo
    Test {
        /// Test runner: cargo, pytest, jest, vitest, go, rspec, rails
        runner: String,

        /// Additional arguments for the test runner
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Failures-only lint wrapper
    ///
    /// Example: fdx lint clippy
    Lint {
        /// Linter: ruff, clippy, tsc, eslint, biome, golangci, rubocop
        linter: String,

        /// Additional arguments for the linter
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    /// Project-wide symbol outline
    ///
    /// Example: fdx outline src/ --depth 2 --kind function,struct
    Outline {
        /// Paths to outline (files or directories)
        paths: Vec<PathBuf>,

        /// Directory traversal depth (default: unlimited)
        #[arg(long)]
        depth: Option<usize>,

        /// Comma-separated kind filter: function,class,struct,trait,interface,enum,method,type
        #[arg(long)]
        kind: Option<String>,

        /// Only include symbols with body >= N lines
        #[arg(long, default_value = "1")]
        min_lines: usize,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,

        /// Bypass session AST cache
        #[arg(long)]
        no_cache: bool,
    },

    /// Symbol-aware git diff
    ///
    /// Example: fdx diff HEAD~1 --format json
    Diff {
        /// Git ref to diff against (default: HEAD~1)
        commit: Option<String>,

        /// Paths to limit diff to
        #[arg(last = true)]
        paths: Vec<PathBuf>,

        /// Diff staged changes (index vs HEAD)
        #[arg(long)]
        staged: bool,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,

        /// Bypass session AST cache
        #[arg(long)]
        no_cache: bool,

        /// Git repository root
        #[arg(long, default_value = ".")]
        root: PathBuf,
    },

    /// AST knowledge graph: build the cache, or query a symbol
    ///
    /// Examples: fdx graph build | fdx graph query calculate_fee |
    /// fdx graph report | fdx graph deps src/a.ts | fdx graph path a b |
    /// fdx graph explain calculate_fee
    Graph {
        /// Action: build, query, report, status, impact, deps, path, or explain
        action: String,

        /// Symbol name or file path (required for query, deps, path, explain)
        #[arg(default_value = "")]
        target: String,

        /// Destination for action=path
        #[arg(default_value = "")]
        target2: String,

        /// Output format: text or json
        #[arg(long, default_value = "text")]
        format: String,
    },

    /// Per-topic agent-output log: append, read, or clear
    ///
    /// Example: fdx context --topic mytopic --action append --agent coder --stage impl --summary "..."
    Context {
        /// Action: append, read, or clear
        #[arg(long, default_value = "read")]
        action: String,

        /// Topic slug (will be re-slugified by Rust's canonical slugify_topic)
        #[arg(long)]
        topic: String,

        /// Agent name (required for action=append)
        #[arg(long)]
        agent: Option<String>,

        /// Stage name (required for action=append)
        #[arg(long)]
        stage: Option<String>,

        /// Summary text (required for action=append)
        #[arg(long)]
        summary: Option<String>,
    },

    /// Per-topic design-decision log: record or read
    ///
    /// Example: fdx decisions --topic mytopic --action record --decision "..." --rationale "..."
    Decisions {
        /// Action: record or read
        #[arg(long, default_value = "read")]
        action: String,

        /// Topic slug (will be re-slugified by Rust's canonical slugify_topic)
        #[arg(long)]
        topic: String,

        /// Decision text (required for action=record)
        #[arg(long)]
        decision: Option<String>,

        /// Rationale text (required for action=record)
        #[arg(long)]
        rationale: Option<String>,

        /// Who made the decision (defaults to "orchestrator")
        #[arg(long)]
        made_by: Option<String>,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Read {
            file,
            mode,
            symbol,
            limit,
            offset,
            with_deps,
            format,
            no_cache,
        } => {
            let mode = parse_mode(&mode);
            let format = parse_format(&format);

            let options = ReaderOptions {
                mode,
                symbol,
                limit,
                offset,
                with_deps,
                format,
                no_cache,
            };

            let cache = AstCache::new();

            match read_file(&file, &options, &cache) {
                Ok(result) => {
                    let mut stdout = std::io::stdout();
                    match result {
                        fdx::reader::ReadResult::Code(code_result) => {
                            match options.format {
                                OutputFormat::Text => {
                                    if let Err(e) = text::print_text_output(
                                        &mut stdout,
                                        &code_result.path,
                                        &code_result.language,
                                        &code_result.mode,
                                        code_result.total_lines,
                                        &code_result.symbols,
                                        code_result.parse_error.as_deref(),
                                    ) {
                                        eprintln!("Output error: {}", e);
                                        process::exit(1);
                                    }
                                    if code_result.mode == "deep" {
                                        if let Err(e) = text::print_dependencies(
                                            &mut stdout,
                                            &code_result.dependencies,
                                        ) {
                                            eprintln!("Output error: {}", e);
                                            process::exit(1);
                                        }
                                    }
                                }
                                OutputFormat::Json => {
                                    if let Err(e) = json::print_json_output(&mut stdout, &code_result)
                                    {
                                        eprintln!("Output error: {}", e);
                                        process::exit(1);
                                    }
                                }
                            }
                        }
                        fdx::reader::ReadResult::Text(text_result) => {
                            match options.format {
                                OutputFormat::Text => {
                                    if let Err(e) = text::print_text_result(
                                        &mut stdout, &text_result.path, &text_result,
                                    ) {
                                        eprintln!("Output error: {}", e);
                                        process::exit(1);
                                    }
                                }
                                OutputFormat::Json => {
                                    if let Err(e) =
                                        json::print_json_text_result(&mut stdout, &text_result)
                                    {
                                        eprintln!("Output error: {}", e);
                                        process::exit(1);
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error reading file: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Search {
            pattern,
            paths,
            kind,
            format,
            no_cache,
        } => {
            if paths.is_empty() {
                eprintln!("Error: at least one path is required");
                process::exit(1);
            }

            let format = parse_format(&format);
            let kind_filter = if kind == "any" {
                None
            } else {
                Some(kind.as_str())
            };

            let cache = AstCache::new();

            match search::search_symbols(&pattern, &paths, kind_filter, no_cache, &cache) {
                Ok(matches) => {
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = text::print_search_results(&mut stdout, &matches, &pattern) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = json::print_json_search_results(&mut stdout, &matches, &pattern) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error searching: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Grep {
            pattern,
            paths,
            context,
            fixed_strings,
            case_sensitive,
            max_matches,
            format,
        } => {
            if paths.is_empty() {
                eprintln!("Error: at least one path is required");
                process::exit(1);
            }

            let format = parse_format(&format);

            let context = context.min(fdx::reader::grep::ABSOLUTE_MAX_CONTEXT);
            let max_matches = max_matches.min(fdx::reader::grep::ABSOLUTE_MAX_MATCHES);

            match grep::grep_files(&pattern, &paths, context, fixed_strings, case_sensitive, max_matches) {
                Ok((files, total_matches, truncated)) => {
                    let tee_path = if truncated {
                        let full_output = build_full_grep_output(&files, total_matches);
                        fdx::tee::save_tee("grep", &full_output).ok().map(|p| p)
                    } else {
                        None
                    };
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = text::print_grep_results(&mut stdout, &files, total_matches, truncated, tee_path.as_deref()) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = json::print_json_grep_results(&mut stdout, &files, total_matches, truncated, tee_path.as_deref()) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error grepping: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Batch {
            patterns,
            mode,
            symbol,
            format,
            no_cache,
            max_files,
        } => {
            if patterns.is_empty() {
                eprintln!("Error: at least one pattern is required");
                process::exit(1);
            }

            let mode = parse_mode(&mode);
            let format = parse_format(&format);
            let cache = AstCache::new();

            match batch::batch_read(&patterns, mode, symbol.as_deref(), format.clone(), no_cache, max_files, &cache) {
                Ok((items, _count, truncated)) => {
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = text::print_batch_results(&mut stdout, &items, truncated) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = json::print_json_batch_results(&mut stdout, &items, truncated) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error batch reading: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Impact {
            files,
            depth,
            direction,
            format,
            root,
        } => {
            if files.is_empty() {
                eprintln!("Error: at least one file is required");
                process::exit(1);
            }

            let format = parse_format(&format);
            let direction = match direction.parse::<ImpactDirection>() {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("Error: {}", e);
                    process::exit(1);
                }
            };

            let cache = AstCache::new();

            match impact::analyze_impact(&files, &root, depth, direction, &cache) {
                Ok(results) => {
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = text::print_impact_results(&mut stdout, &results) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = json::print_json_impact_results(&mut stdout, &results) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error analyzing impact: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Ls { path, all, format } => {
            let format = parse_format(&format);
            let path = path.unwrap_or_else(|| PathBuf::from("."));

            let options = fdx::reader::ls::LsOptions { all, format: format.clone() };

            match fdx::reader::ls::ls_paths(&path, &options) {
                Ok(result) => {
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = fdx::output::ls_tree_text::print_ls_results(&mut stdout, &result) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = fdx::output::ls_tree_json::print_json_ls_results(&mut stdout, &result) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error listing directory: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Tree { path, depth, dirs_only, format } => {
            let format = parse_format(&format);
            let path = path.unwrap_or_else(|| PathBuf::from("."));

            let options = fdx::reader::tree::TreeOptions { depth, dirs_only };

            match fdx::reader::tree::tree_paths(&path, &options) {
                Ok(result) => {
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = fdx::output::ls_tree_text::print_tree_results(&mut stdout, &result) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = fdx::output::ls_tree_json::print_json_tree_results(&mut stdout, &result) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error generating tree: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Git { args } => {
            if args.is_empty() {
                eprintln!("Error: git subcommand required");
                process::exit(1);
            }

            let subcommand = &args[0];
            let extra_args: Vec<&str> = args.iter().skip(1).map(|s| s.as_str()).collect();

            match fdx::reader::git::run_git(subcommand, &extra_args) {
                Ok(output) => {
                    print!("{}", output.stdout);
                    if !output.stderr.is_empty() {
                        eprint!("{}", output.stderr);
                    }
                    if !output.success {
                        process::exit(output.exit_code);
                    }
                }
                Err(e) => {
                    eprintln!("{}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Test { runner, args } => {
            match fdx::reader::test_runner::run_tests(&runner, &args) {
                Ok(output) => {
                    print!("{}", output.stdout);
                    if !output.stderr.is_empty() {
                        eprint!("{}", output.stderr);
                    }
                    if !output.success {
                        process::exit(output.exit_code);
                    }
                }
                Err(e) => {
                    eprintln!("{}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Lint { linter, args } => {
            match fdx::reader::lint::run_linter(&linter, &args) {
                Ok(output) => {
                    print!("{}", output.stdout);
                    if !output.stderr.is_empty() {
                        eprint!("{}", output.stderr);
                    }
                    if !output.success {
                        process::exit(output.exit_code);
                    }
                }
                Err(e) => {
                    eprintln!("{}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Outline {
            paths,
            depth,
            kind,
            min_lines,
            format,
            no_cache,
        } => {
            if paths.is_empty() {
                eprintln!("Error: at least one path is required");
                process::exit(1);
            }

            let format = parse_format(&format);

            let kind_filter = kind.as_ref().map(|k| {
                k.split(',')
                    .map(|s| s.trim().to_lowercase())
                    .collect::<Vec<_>>()
            });

            let options = fdx::reader::outline::OutlineOptions {
                depth,
                kind_filter,
                min_lines,
                no_cache,
            };

            let cache = AstCache::new();

            match fdx::reader::outline::outline_paths(&paths, &options, &cache) {
                Ok(results) => {
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = fdx::output::outline_diff_text::print_outline_results(&mut stdout, &results) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = fdx::output::outline_diff_json::print_json_outline_results(&mut stdout, &results) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error generating outline: {}", e);
                    process::exit(1);
                }
            }
        }

        Commands::Diff {
            commit,
            paths,
            staged,
            format,
            no_cache,
            root,
        } => {
            let format = parse_format(&format);
            let commit_str = commit.unwrap_or_else(|| "HEAD~1".to_string());

            let options = fdx::reader::diff::DiffOptions {
                commit: commit_str.clone(),
                staged,
                paths,
                no_cache,
                root,
            };

            let cache = AstCache::new();

            match fdx::reader::diff::diff_against(&options, &cache) {
                Ok(results) => {
                    let mut stdout = std::io::stdout();
                    match format {
                        OutputFormat::Text => {
                            if let Err(e) = fdx::output::outline_diff_text::print_diff_results(&mut stdout, &results, &commit_str, staged) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                        OutputFormat::Json => {
                            if let Err(e) = fdx::output::outline_diff_json::print_json_diff_results(&mut stdout, &results, &commit_str, staged) {
                                eprintln!("Output error: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("{}", e);
                    process::exit(1);
                }
            }
        }
        Commands::Graph {
            action,
            target,
            target2,
            format,
        } => {
            let home = match std::env::var_os("HOME") {
                Some(s) => std::path::PathBuf::from(s),
                None => {
                    eprintln!("Error: HOME environment variable not set");
                    process::exit(1);
                }
            };
            let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            match action.as_str() {
                "build" => match fdx::commands::graph::build::build(&home, &cwd) {
                    Ok(stats) => {
                        println!(
                            "Graph built - {} nodes, {} edges ({} files parsed, {} skipped unchanged, {} removed)",
                            stats.nodes,
                            stats.edges,
                            stats.files_parsed,
                            stats.files_skipped,
                            stats.files_removed
                        );
                        if stats.warm_started {
                            println!("Warm-started from the main checkout's graph.");
                        }
                        if stats.warnings > 0 {
                            let detail = stats
                                .warnings_by_kind
                                .iter()
                                .map(|(kind, count)| format!("{count} {kind}"))
                                .collect::<Vec<_>>()
                                .join(", ");
                            println!("{} file(s) produced warnings: {detail}", stats.warnings);
                        }
                        if stats.wrote {
                            println!("Saved: {}", stats.graph_path.display());
                        } else {
                            println!(
                                "No changes - left {} untouched.",
                                stats.graph_path.display()
                            );
                        }
                    }
                    Err(e) => {
                        eprintln!("Error: {e}");
                        process::exit(1);
                    }
                },
                "query" => {
                    if target.is_empty() {
                        eprintln!("Error: action=query requires a symbol name");
                        process::exit(1);
                    }
                    let identity = match fdx::paths::resolve_repo_identity(&cwd) {
                        Some(id) => id,
                        None => {
                            eprintln!("Error: not inside a git repository");
                            process::exit(1);
                        }
                    };
                    let graph_path = fdx::paths::graph_path(&home, &identity);
                    let root = identity.canonical_root.to_string_lossy().to_string();
                    match fdx::commands::graph::build::load_for_read(&graph_path, &root) {
                        Ok(graph) => {
                            let reports = fdx::commands::graph::query::query(&graph, &target);
                            if format == "json" {
                                match serde_json::to_string_pretty(&reports) {
                                    Ok(json) => println!("{json}"),
                                    Err(e) => {
                                        eprintln!("Error: {e}");
                                        process::exit(1);
                                    }
                                }
                            } else {
                                print!(
                                    "{}",
                                    fdx::commands::graph::query::render_text(&reports, &target)
                                );
                            }
                        }
                        Err(msg) => {
                            eprintln!("{msg}");
                            process::exit(1);
                        }
                    }
                }
                "report" => {
                    let identity = match fdx::paths::resolve_repo_identity(&cwd) {
                        Some(id) => id,
                        None => {
                            eprintln!("Error: not inside a git repository");
                            process::exit(1);
                        }
                    };
                    let graph_path = fdx::paths::graph_path(&home, &identity);
                    let root = identity.canonical_root.to_string_lossy().to_string();
                    match fdx::commands::graph::report::write_report(
                        &home, &identity, &graph_path, &root,
                    ) {
                        Ok((path, summary)) => {
                            println!("{summary}");
                            println!("Report written: {}", path.display());
                        }
                        Err(e) => {
                            eprintln!("Error: {e}");
                            process::exit(1);
                        }
                    }
                }
                "status" => {
                    let identity = match fdx::paths::resolve_repo_identity(&cwd) {
                        Some(id) => id,
                        None => {
                            eprintln!("Error: not inside a git repository");
                            process::exit(1);
                        }
                    };
                    let graph_path = fdx::paths::graph_path(&home, &identity);
                    let root = identity.canonical_root.to_string_lossy().to_string();
                    let state = fdx::commands::graph::build::status(&graph_path, &root);
                    print!("{}", fdx::commands::graph::build::render_status(&state));
                }
                "deps" | "path" | "explain" | "impact" => {
                    if target.is_empty() {
                        eprintln!("Error: action={action} requires a symbol name or file path");
                        process::exit(1);
                    }
                    if action == "path" && target2.is_empty() {
                        eprintln!("Error: action=path requires two arguments (from and to)");
                        process::exit(1);
                    }
                    let identity = match fdx::paths::resolve_repo_identity(&cwd) {
                        Some(id) => id,
                        None => {
                            eprintln!("Error: not inside a git repository");
                            process::exit(1);
                        }
                    };
                    let graph_path = fdx::paths::graph_path(&home, &identity);
                    let root = identity.canonical_root.to_string_lossy().to_string();
                    let graph = match fdx::commands::graph::build::load_for_read(&graph_path, &root)
                    {
                        Ok(g) => g,
                        Err(msg) => {
                            eprintln!("{msg}");
                            process::exit(1);
                        }
                    };
                    use fdx::commands::graph::navigate;

                    match action.as_str() {
                        "deps" => {
                            let matches = navigate::resolve_target(&graph, &target);
                            let Some(node) = matches.first() else {
                                eprintln!(
                                    "'{target}' not found. Run `fdx graph build` to refresh."
                                );
                                process::exit(1);
                            };
                            let report = navigate::deps(&graph, &node.file);
                            print!("{}", navigate::render_deps(&report));
                        }
                        "path" => {
                            let from_matches = navigate::resolve_target(&graph, &target);
                            let to_matches = navigate::resolve_target(&graph, &target2);
                            let (Some(from), Some(to)) =
                                (from_matches.first(), to_matches.first())
                            else {
                                eprintln!(
                                    "Could not resolve '{target}' and/or '{target2}'. \
                                     Run `fdx graph build` to refresh."
                                );
                                process::exit(1);
                            };
                            let hops = navigate::shortest_path(&graph, &from.id, &to.id);
                            print!("{}", navigate::render_path(&from.id, &to.id, &hops));
                        }
                        "impact" => {
                            let matches = navigate::resolve_target(&graph, &target);
                            let Some(node) = matches.first() else {
                                eprintln!(
                                    "'{target}' not found. Run `fdx graph build` to refresh."
                                );
                                process::exit(1);
                            };
                            let report = navigate::impact(&graph, &node.file, 3);
                            print!("{}", navigate::render_impact(&report));
                        }
                        _ => {
                            let matches = navigate::resolve_target(&graph, &target);
                            let Some(node) = matches.first() else {
                                eprintln!(
                                    "'{target}' not found. Run `fdx graph build` to refresh."
                                );
                                process::exit(1);
                            };
                            let explanation = navigate::explain(
                                &graph,
                                node,
                                &identity.canonical_root,
                            );
                            print!("{}", navigate::render_explanation(&explanation));
                        }
                    }
                }
                other => {
                    eprintln!(
                        "Error: unknown graph action '{other}' \
                         (expected build, query, report, status, impact, deps, path, or explain)"
                    );
                    process::exit(1);
                }
            }
        }

        Commands::Context {
            action,
            topic,
            agent,
            stage,
            summary,
        } => {
            let home = match std::env::var_os("HOME") {
                Some(s) => std::path::PathBuf::from(s),
                None => {
                    eprintln!("Error: HOME environment variable not set");
                    process::exit(1);
                }
            };
            // Project slug from the current working directory's basename.
            let project_slug = std::path::Path::new(".")
                .canonicalize()
                .ok()
                .and_then(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_owned())
                })
                .unwrap_or_default();
            let result = match action.as_str() {
                "append" => fdx::commands::context::append(
                    &home,
                    &project_slug,
                    &topic,
                    agent.as_deref().unwrap_or(""),
                    stage.as_deref().unwrap_or(""),
                    summary.as_deref().unwrap_or(""),
                ),
                "read" => fdx::commands::context::read(&home, &project_slug, &topic),
                "clear" => fdx::commands::context::clear(&home, &project_slug, &topic),
                other => Err(format!("Error: unknown action {}", other)),
            };
            match result {
                Ok(s) => println!("{}", s),
                Err(e) => {
                    eprintln!("{}", e);
                    process::exit(1);
                }
            }
        }
        Commands::Decisions {
            action,
            topic,
            decision,
            rationale,
            made_by,
        } => {
            let home = match std::env::var_os("HOME") {
                Some(s) => std::path::PathBuf::from(s),
                None => {
                    eprintln!("Error: HOME environment variable not set");
                    process::exit(1);
                }
            };
            let project_slug = std::path::Path::new(".")
                .canonicalize()
                .ok()
                .and_then(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_owned())
                })
                .unwrap_or_default();
            let result = match action.as_str() {
                "record" => fdx::commands::decisions::record(
                    &home,
                    &project_slug,
                    &topic,
                    decision.as_deref().unwrap_or(""),
                    rationale.as_deref().unwrap_or(""),
                    made_by.as_deref(),
                ),
                "read" => fdx::commands::decisions::read(&home, &project_slug, &topic),
                other => Err(format!("Error: unknown action {}", other)),
            };
            match result {
                Ok(s) => println!("{}", s),
                Err(e) => {
                    eprintln!("{}", e);
                    process::exit(1);
                }
            }
        }
    }
}

fn parse_mode(mode: &str) -> ReadMode {
    match mode.parse::<ReadMode>() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
    }
}

fn parse_format(format: &str) -> OutputFormat {
    match format.parse::<OutputFormat>() {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
    }
}

/// Reconstruct the full grep output as a string for teeing.
fn build_full_grep_output(files: &[fdx::reader::grep::GrepFileResult], total_matches: usize) -> String {
    use std::fmt::Write as _;
    let mut output = String::new();
    for file in files {
        let _ = writeln!(&mut output,
            "[file] {}  ({} matches)",
            file.path,
            file.matches.len()
        );
        for m in &file.matches {
            for ctx in &m.context_before {
                let _ = writeln!(&mut output, "  {}", ctx);
            }
            let _ = writeln!(&mut output, "  L{}: {}", m.line_number, m.text);
            for ctx in &m.context_after {
                let _ = writeln!(&mut output, "  {}", ctx);
            }
        }
    }
    let _ = writeln!(
        &mut output,
        "{} match{} across {} file{}",
        total_matches,
        if total_matches == 1 { "" } else { "es" },
        files.len(),
        if files.len() == 1 { "" } else { "s" }
    );
    output
}
