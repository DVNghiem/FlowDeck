use std::path::Path;

/// A supported language: its display name and its tree-sitter grammar.
///
/// Symbol extraction is driven by the per-language query files in
/// `reader/code/queries/`, keyed on `name`, so no node-type list lives here.
pub struct LanguageProvider {
    pub name: &'static str,
    pub grammar: fn() -> tree_sitter::Language,
}

fn rust_grammar() -> tree_sitter::Language {
    tree_sitter_rust::LANGUAGE.into()
}

fn python_grammar() -> tree_sitter::Language {
    tree_sitter_python::LANGUAGE.into()
}

fn typescript_grammar() -> tree_sitter::Language {
    tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()
}

fn javascript_grammar() -> tree_sitter::Language {
    tree_sitter_javascript::LANGUAGE.into()
}

fn java_grammar() -> tree_sitter::Language {
    tree_sitter_java::LANGUAGE.into()
}

pub fn get_language_provider(ext: &str) -> Option<LanguageProvider> {
    match ext {
        "rs" => Some(LanguageProvider {
            name: "rust",
            grammar: rust_grammar,
        }),
        "py" => Some(LanguageProvider {
            name: "python",
            grammar: python_grammar,
        }),
        "ts" | "tsx" => Some(LanguageProvider {
            name: "typescript",
            grammar: typescript_grammar,
        }),
        "js" | "jsx" | "mjs" | "cjs" => Some(LanguageProvider {
            name: "javascript",
            grammar: javascript_grammar,
        }),
        "java" => Some(LanguageProvider {
            name: "java",
            grammar: java_grammar,
        }),
        _ => None,
    }
}

pub fn detect_language(path: &Path) -> Option<LanguageProvider> {
    path.extension()
        .and_then(|e| e.to_str())
        .and_then(get_language_provider)
}
