use fdx::reader::code::{
    parser::parse_source, prototype::PrototypeReader,
};

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
