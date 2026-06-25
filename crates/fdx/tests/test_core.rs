use fdx::output::OutputFormat;
use fdx::reader::code::
    languages::detect_language 
;
use fdx::reader::text::read_text;
use fdx::reader::ReadMode;

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
