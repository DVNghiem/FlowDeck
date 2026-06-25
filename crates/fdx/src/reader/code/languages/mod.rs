use std::path::Path;

pub struct LanguageProvider {
    pub name: &'static str,
    pub grammar: fn() -> tree_sitter::Language,
    pub symbol_node_types: Vec<&'static str>,
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
            symbol_node_types: vec![
                "function_item",
                "struct_item",
                "enum_item",
                "trait_item",
                "impl_item",
                "type_item",
                "const_item",
                "static_item",
                "macro_definition",
            ],
        }),
        "py" => Some(LanguageProvider {
            name: "python",
            grammar: python_grammar,
            symbol_node_types: vec![
                "function_definition",
                "class_definition",
                "decorated_definition",
            ],
        }),
        "ts" | "tsx" => Some(LanguageProvider {
            name: "typescript",
            grammar: typescript_grammar,
            symbol_node_types: vec![
                "function_declaration",
                "function_signature",
                "class_declaration",
                "interface_declaration",
                "enum_declaration",
                "type_alias_declaration",
                "method_definition",
                "method_signature",
            ],
        }),
        "js" | "jsx" | "mjs" | "cjs" => Some(LanguageProvider {
            name: "javascript",
            grammar: javascript_grammar,
            symbol_node_types: vec![
                "function_declaration",
                "class_declaration",
                "method_definition",
            ],
        }),
        "java" => Some(LanguageProvider {
            name: "java",
            grammar: java_grammar,
            symbol_node_types: vec![
                "method_declaration",
                "class_declaration",
                "interface_declaration",
                "enum_declaration",
            ],
        }),
        _ => None,
    }
}

pub fn detect_language(path: &Path) -> Option<LanguageProvider> {
    path.extension()
        .and_then(|e| e.to_str())
        .and_then(get_language_provider)
}
