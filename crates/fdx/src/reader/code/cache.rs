use dashmap::DashMap;
use std::path::PathBuf;
use std::time::SystemTime;
use tree_sitter::Tree;

pub struct AstCache {
    cache: DashMap<PathBuf, (SystemTime, Tree)>,
}

impl AstCache {
    pub fn new() -> Self {
        Self {
            cache: DashMap::new(),
        }
    }

    pub fn get(&self, path: &PathBuf, current_mtime: SystemTime) -> Option<Tree> {
        if let Some(entry) = self.cache.get(path) {
            let (cached_mtime, tree) = entry.value();
            if *cached_mtime == current_mtime {
                return Some(tree.clone());
            }
        }
        None
    }

    pub fn insert(&self, path: PathBuf, mtime: SystemTime, tree: Tree) {
        self.cache.insert(path, (mtime, tree));
    }
}

impl Default for AstCache {
    fn default() -> Self {
        Self::new()
    }
}
