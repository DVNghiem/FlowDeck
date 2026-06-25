use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process;

use fdx::output::{json, text, OutputFormat};
use fdx::reader::code::cache::AstCache;
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
            let mode = match mode.parse::<ReadMode>() {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("Error: {}", e);
                    process::exit(1);
                }
            };

            let format = match format.parse::<OutputFormat>() {
                Ok(f) => f,
                Err(e) => {
                    eprintln!("Error: {}", e);
                    process::exit(1);
                }
            };

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
                                    if let Err(e) = json::print_json_output(&mut stdout, &code_result,
                                    ) {
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
                                    if let Err(e) = json::print_json_text_result(
                                        &mut stdout, &text_result,
                                    ) {
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
    }
}
