use fdx::reader::code::{
    cache::AstCache, parser::parse_source,
};
use std::time::SystemTime;

#[test]
fn test_cache_hit_miss() {
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
