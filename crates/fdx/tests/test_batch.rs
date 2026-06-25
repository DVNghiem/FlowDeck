use fdx::output::OutputFormat;
use fdx::reader::batch;
use fdx::reader::code::cache::AstCache;
use fdx::reader::ReadMode;

#[test]
fn test_batch_read() {
    let temp_dir = "/tmp/fdx_batch_test";
    let _ = std::fs::remove_dir_all(temp_dir);
    std::fs::create_dir_all(temp_dir).unwrap();

    let file1 = format!("{}/a.rs", temp_dir);
    std::fs::write(&file1, "pub fn foo() {}\n").unwrap();

    let file2 = format!("{}/b.rs", temp_dir);
    std::fs::write(&file2, "pub fn bar() {}\n").unwrap();

    let cache = AstCache::new();
    let (items, count, truncated) = batch::batch_read(
        &[format!("{}/*.rs", temp_dir)],
        ReadMode::Prototype,
        None,
        OutputFormat::Text,
        true,
        20,
        &cache,
    )
    .unwrap();

    assert_eq!(count, 2);
    assert!(!truncated);

    let names: Vec<String> = items
        .iter()
        .filter_map(|item| match item {
            batch::BatchItem::Ok(code) => Some(code.symbols[0].name.clone()),
            _ => None,
        })
        .collect();
    assert!(names.contains(&"foo".to_string()));
    assert!(names.contains(&"bar".to_string()));

    let _ = std::fs::remove_dir_all(temp_dir);
}
