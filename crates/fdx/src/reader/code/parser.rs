use tree_sitter::{Language, Parser};

pub fn parse_source(source: &str, language: Language) -> anyhow::Result<tree_sitter::Tree> {
    let mut parser = Parser::new();
    parser.set_language(&language)?;
    parser
        .parse(source, None)
        .ok_or_else(|| anyhow::anyhow!("Failed to parse source"))
}
