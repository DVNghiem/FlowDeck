use fdx::output::{json, text, OutputFormat};
use fdx::reader::code::{
    cache::AstCache, deep::DeepReader, languages::detect_language, parser::parse_source,
    prototype::PrototypeReader, CodeReader, CodeResult, Symbol,
};
use fdx::reader::text::read_text;
use fdx::reader::ReadMode;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_format_parsing() {
        assert!(matches!(
            "text".parse::<OutputFormat>().unwrap(),
            OutputFormat::Text
        ));
        assert!(matches!(
            "json".parse::<OutputFormat>().unwrap(),
            OutputFormat::Json
        ));
        assert!("xml".parse::<OutputFormat>().is_err());
    }

    #[test]
    fn test_read_mode_parsing() {
        assert!(matches!("auto".parse::<ReadMode>().unwrap(), ReadMode::Auto));
        assert!(matches!("raw".parse::<ReadMode>().unwrap(), ReadMode::Raw));
        assert!(matches!(
            "prototype".parse::<ReadMode>().unwrap(),
            ReadMode::Prototype
        ));
        assert!(matches!("deep".parse::<ReadMode>().unwrap(), ReadMode::Deep));
        assert!("unknown".parse::<ReadMode>().is_err());
    }

    #[test]
    fn test_text_reader_full() {
        let temp_path = "/tmp/fdx_test_full.txt";
        std::fs::write(temp_path, "line1\nline2\nline3\n").unwrap();

        let result = read_text(std::path::Path::new(temp_path), 1, None).unwrap();
        assert_eq!(result.total_lines, 3);
        assert_eq!(result.returned_lines, 3);
        assert_eq!(result.lines.len(), 3);
        assert_eq!(result.lines[0], "line1");
        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn test_text_reader_with_offset_and_limit() {
        let temp_path = "/tmp/fdx_test_offset.txt";
        std::fs::write(temp_path, "a\nb\nc\nd\ne\n").unwrap();

        let result = read_text(std::path::Path::new(temp_path), 2, Some(2)).unwrap();
        assert_eq!(result.total_lines, 5);
        assert_eq!(result.offset, 2);
        assert_eq!(result.returned_lines, 2);
        assert_eq!(result.lines, vec!["b", "c"]);
        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn test_text_reader_offset_beyond_end() {
        let temp_path = "/tmp/fdx_test_beyond.txt";
        std::fs::write(temp_path, "a\nb\n").unwrap();

        let result = read_text(std::path::Path::new(temp_path), 10, None).unwrap();
        assert_eq!(result.total_lines, 2);
        assert_eq!(result.returned_lines, 0);
        assert!(result.lines.is_empty());
        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn test_language_detection() {
        use std::path::Path;
        assert!(detect_language(Path::new("test.rs")).is_some());
        assert!(detect_language(Path::new("test.py")).is_some());
        assert!(detect_language(Path::new("test.ts")).is_some());
        assert!(detect_language(Path::new("test.tsx")).is_some());
        assert!(detect_language(Path::new("test.js")).is_some());
        assert!(detect_language(Path::new("test.java")).is_some());
        assert!(detect_language(Path::new("test.txt")).is_none());
        assert!(detect_language(Path::new("test.md")).is_none());
    }

    #[test]
    fn test_cache_hit_miss() {
        use std::time::SystemTime;
        let cache = AstCache::new();
        let path = std::path::PathBuf::from("/tmp/test.rs");
        let mtime = SystemTime::now();

        // Miss before insert
        assert!(cache.get(&path, mtime).is_none());

        // Parse a dummy tree for insertion
        let source = "fn main() {}";
        let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
        cache.insert(path.clone(), mtime, tree.clone());

        // Hit after insert
        assert!(cache.get(&path, mtime).is_some());

        // Miss with different mtime
        let different_mtime = mtime + std::time::Duration::from_secs(1);
        assert!(cache.get(&path, different_mtime).is_none());
    }

    #[test]
    fn test_prototype_rust() {
        let source = r#"
/// Doc comment for foo
pub fn foo(x: i32) -> i32 {
    x + 1
}

pub struct Bar {
    field: String,
}
"#;
        let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
        let reader = PrototypeReader::new();
        let symbols = reader.extract_prototypes(std::path::Path::new("test.rs"), source, &tree).unwrap();

        assert_eq!(symbols.len(), 2);
        assert_eq!(symbols[0].kind, "function");
        assert_eq!(symbols[0].name, "foo");
        assert_eq!(symbols[0].doc_comment, Some("Doc comment for foo".to_string()));
        assert_eq!(symbols[1].kind, "class");
        assert_eq!(symbols[1].name, "Bar");
    }

    #[test]
    fn test_prototype_python() {
        let source = r#"
def calculate(x, y):
    """Calculate sum."""
    return x + y

class Point:
    pass
"#;
        let tree = parse_source(source, tree_sitter_python::LANGUAGE.into()).unwrap();
        let reader = PrototypeReader::new();
        let symbols = reader
            .extract_prototypes(std::path::Path::new("test.py"), source, &tree)
            .unwrap();

        assert_eq!(symbols.len(), 2);
        assert_eq!(symbols[0].kind, "function");
        assert_eq!(symbols[0].name, "calculate");
        assert_eq!(symbols[1].kind, "class");
        assert_eq!(symbols[1].name, "Point");
    }

    #[test]
    fn test_prototype_javascript() {
        let source = r#"
function add(a, b) {
    return a + b;
}

class Calculator {
    multiply(a, b) {
        return a * b;
    }
}
"#;
        let tree = parse_source(source, tree_sitter_javascript::LANGUAGE.into()).unwrap();
        let reader = PrototypeReader::new();
        let symbols = reader
            .extract_prototypes(std::path::Path::new("test.js"), source, &tree)
            .unwrap();

        assert_eq!(symbols.len(), 2);
        assert_eq!(symbols[0].kind, "function");
        assert_eq!(symbols[0].name, "add");
        assert_eq!(symbols[1].kind, "class");
        assert_eq!(symbols[1].name, "Calculator");
    }

    #[test]
    fn test_prototype_typescript() {
        let source = r#"
interface Point {
    x: number;
    y: number;
}

function distance(p1: Point, p2: Point): number {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}
"#;
        let tree = parse_source(source, tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()).unwrap();
        let reader = PrototypeReader::new();
        let symbols = reader
            .extract_prototypes(std::path::Path::new("test.ts"), source, &tree)
            .unwrap();

        assert_eq!(symbols.len(), 2);
        assert_eq!(symbols[0].kind, "interface");
        assert_eq!(symbols[0].name, "Point");
        assert_eq!(symbols[1].kind, "function");
        assert_eq!(symbols[1].name, "distance");
    }

    #[test]
    fn test_prototype_java() {
        let source = r#"
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }
}
"#;
        let tree = parse_source(source, tree_sitter_java::LANGUAGE.into()).unwrap();
        let reader = PrototypeReader::new();
        let symbols = reader
            .extract_prototypes(std::path::Path::new("test.java"), source, &tree)
            .unwrap();

        assert!(!symbols.is_empty());
        assert_eq!(symbols[0].kind, "class");
        assert_eq!(symbols[0].name, "Calculator");
    }

    #[test]
    fn test_json_output_format() {
        let result = CodeResult {
            path: "test.rs".to_string(),
            language: "rust".to_string(),
            mode: "prototype".to_string(),
            total_lines: 10,
            symbols: vec![Symbol {
                kind: "function".to_string(),
                name: "main".to_string(),
                signature: "fn main()".to_string(),
                doc_comment: None,
                line_start: 1,
                line_end: 3,
                body: None,
            }],
            dependencies: vec![],
            parse_error: None,
        };

        let mut buf = Vec::new();
        json::print_json_output(&mut buf, &result).unwrap();
        let output = String::from_utf8(buf).unwrap();
        assert!(output.contains("\"path\": \"test.rs\""));
        assert!(output.contains("\"name\": \"main\""));
    }

    #[test]
    fn test_text_output_format() {
        let symbols = vec![
            Symbol {
                kind: "function".to_string(),
                name: "foo".to_string(),
                signature: "fn foo()".to_string(),
                doc_comment: Some("Does foo".to_string()),
                line_start: 1,
                line_end: 3,
                body: None,
            },
            Symbol {
                kind: "struct".to_string(),
                name: "Bar".to_string(),
                signature: "struct Bar".to_string(),
                doc_comment: None,
                line_start: 5,
                line_end: 7,
                body: None,
            },
        ];

        let mut buf = Vec::new();
        text::print_text_output(
            &mut buf,
            "test.rs",
            "rust",
            "prototype",
            10,
            &symbols,
            None,
        )
        .unwrap();

        let output = String::from_utf8(buf).unwrap();
        assert!(output.contains("[fn] fn foo()"));
        assert!(output.contains("// Does foo"));
        assert!(output.contains("[struct] struct Bar"));
    }

    #[test]
    fn test_parse_error_fallback() {
        // Test that a completely invalid source doesn't crash
        let source = "@#$%^&*()";
        let _result = parse_source(source, tree_sitter_rust::LANGUAGE.into());
        // Some grammars may parse anything; if it fails, we should handle gracefully
        // The main point is it doesn't panic
    }

    #[test]
    fn test_deep_mode_with_symbol() {
        let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    let base = amount * rate;
    Fee { amount: base }
}
"#;
        let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
        let reader = DeepReader::new();
        let result = reader
            .read_deep(
                std::path::Path::new("test.rs"),
                source,
                &tree,
                Some("calculate_fee"),
                false,
            )
            .unwrap();

        assert_eq!(result.symbols.len(), 1);
        assert_eq!(result.symbols[0].name, "calculate_fee");
        assert!(result.symbols[0].body.is_some());
        let body = result.symbols[0].body.as_ref().unwrap();
        assert!(body.contains("let base = amount * rate"));
        assert!(body.contains("Fee { amount: base }"));
        assert!(result.dependencies.is_empty());
    }

    #[test]
    fn test_deep_mode_all_symbols() {
        let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    Fee { amount: amount * rate }
}
"#;
        let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
        let reader = DeepReader::new();
        let result = reader
            .read_deep(std::path::Path::new("test.rs"), source, &tree, None, false)
            .unwrap();

        assert_eq!(result.symbols.len(), 2);
        // All symbols should have bodies
        for sym in &result.symbols {
            assert!(
                sym.body.is_some(),
                "Symbol {} should have a body",
                sym.name
            );
        }
    }

    #[test]
    fn test_deep_mode_with_dependencies() {
        let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    let base = amount * rate;
    Fee { amount: base }
}
"#;
        let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
        let reader = DeepReader::new();
        let result = reader
            .read_deep(
                std::path::Path::new("test.rs"),
                source,
                &tree,
                Some("calculate_fee"),
                true,
            )
            .unwrap();

        assert_eq!(result.symbols.len(), 1);
        assert!(!result.dependencies.is_empty());

        // Fee should be resolved as a same-file dependency
        let fee_dep = result
            .dependencies
            .iter()
            .find(|d| d.name == "Fee")
            .expect("Fee should be a dependency");
        assert_eq!(fee_dep.kind, "type_ref");
        assert_eq!(fee_dep.source.as_deref(), Some("same_file"));
        assert!(fee_dep.prototype.is_some());
        let proto = fee_dep.prototype.as_ref().unwrap();
        assert_eq!(proto.name, "Fee");
        assert_eq!(proto.kind, "class");
    }

    #[test]
    fn test_deep_mode_no_deps() {
        let source = r#"
pub struct Fee {
    pub amount: f64,
}

pub fn calculate_fee(amount: f64, rate: f64) -> Fee {
    let base = amount * rate;
    Fee { amount: base }
}
"#;
        let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
        let reader = DeepReader::new();
        let result = reader
            .read_deep(
                std::path::Path::new("test.rs"),
                source,
                &tree,
                Some("calculate_fee"),
                false,
            )
            .unwrap();

        assert!(result.dependencies.is_empty());
    }

    #[test]
    fn test_deep_mode_symbol_not_found() {
        let source = r#"
pub fn foo() {}
"#;
        let tree = parse_source(source, tree_sitter_rust::LANGUAGE.into()).unwrap();
        let reader = DeepReader::new();
        let result = reader.read_deep(
            std::path::Path::new("test.rs"),
            source,
            &tree,
            Some("nonexistent"),
            false,
        );

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("nonexistent"));
        assert!(err.contains("not found"));
    }
}
