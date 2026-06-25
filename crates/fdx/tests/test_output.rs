use fdx::output::{json, text};
use fdx::reader::code::{CodeResult, Symbol};

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
