//! Exclusive advisory lock for a graph build.
//!
//! Deliberately NOT `crate::locking`, whose semantics are tuned for short appends
//! and preserved 1:1 with the TypeScript implementation: a 1 second timeout that
//! then proceeds **unlocked**. Both are wrong here.
//!
//! - A build takes seconds, so a 1s timeout would essentially always expire and
//!   then race, which is the lost-update case the lock exists to prevent.
//! - Proceeding unlocked is worse than refusing: two builds cannot corrupt
//!   `graph.json` (the write is an atomic rename) but they can lose each other's
//!   cache state, and a reader can observe `graph.json` and `GRAPH_REPORT.md`
//!   produced by different builds.
//!
//! So this refuses instead, and steals a lock left behind by a crashed build:
//! a permanently stuck lock on a derived cache is far worse than one skipped run.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// A lock older than this is assumed to belong to a crashed build and is stolen.
///
/// Generously above a real build (measured ~2s on a 191-file repo), so a slow
/// build on a large repository is never stolen out from under itself.
pub const STALE_AFTER: Duration = Duration::from_secs(60);

/// Another build holds the lock.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockBusy {
    pub path: PathBuf,
    /// Age of the held lock, when it could be determined.
    pub held_for: Option<Duration>,
}

impl std::fmt::Display for LockBusy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.held_for {
            Some(age) => write!(
                f,
                "another `fdx graph build` is in progress (lock at {} held for {}s). \
                 Wait for it to finish, or delete the lock if that build died.",
                self.path.display(),
                age.as_secs()
            ),
            None => write!(
                f,
                "another `fdx graph build` is in progress (lock at {}).",
                self.path.display()
            ),
        }
    }
}

impl std::error::Error for LockBusy {}

/// Held build lock. Released on drop, including on panic and on `?` unwind.
#[derive(Debug)]
pub struct BuildLock {
    path: PathBuf,
}

impl BuildLock {
    /// Lock sidecar beside the graph file.
    fn lock_path(graph_path: &Path) -> PathBuf {
        let mut raw = graph_path.as_os_str().to_owned();
        raw.push(".buildlock");
        PathBuf::from(raw)
    }

    /// Age of an existing lock file, if it can be determined.
    ///
    /// `symlink_metadata` deliberately: `metadata` follows symlinks, so a lock
    /// symlinked at any old file would always look stale and be stolen.
    fn age_of(path: &Path) -> Option<Duration> {
        let modified = std::fs::symlink_metadata(path).ok()?.modified().ok()?;
        SystemTime::now().duration_since(modified).ok()
    }

    /// Claim the lock, stealing it when it is stale.
    ///
    /// Does not wait: a caller who wants to retry can decide that for itself,
    /// and blocking a wave on another wave's build is not obviously desirable.
    pub fn acquire(graph_path: &Path) -> Result<Self, LockBusy> {
        let path = Self::lock_path(graph_path);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if Self::claim(&path) {
            return Ok(Self { path });
        }

        // Contended. Steal only if the holder looks dead.
        let age = Self::age_of(&path);
        if age.is_some_and(|a| a >= STALE_AFTER) {
            let _ = std::fs::remove_file(&path);
            if Self::claim(&path) {
                return Ok(Self { path });
            }
        }

        Err(LockBusy {
            path,
            held_for: age,
        })
    }

    /// Atomic create-new claim. `create_new` is the check-and-set.
    fn claim(path: &Path) -> bool {
        match OpenOptions::new().write(true).create_new(true).open(path) {
            Ok(mut file) => {
                let _ = writeln!(file, "{}", std::process::id());
                true
            }
            Err(_) => false,
        }
    }
}

impl Drop for BuildLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_graph_path(label: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock must be after the epoch")
            .as_nanos();
        dir.push(format!(
            "fdx-buildlock-{}-{}-{}",
            label,
            std::process::id(),
            nanos
        ));
        std::fs::create_dir_all(&dir).expect("temp dir must be creatable");
        dir.join("graph.json")
    }

    #[test]
    fn acquires_when_free() {
        let graph = tmp_graph_path("free");
        let lock = BuildLock::acquire(&graph).expect("must acquire an unheld lock");
        assert!(BuildLock::lock_path(&graph).exists());
        drop(lock);
        assert!(
            !BuildLock::lock_path(&graph).exists(),
            "drop must release the lock"
        );
    }

    #[test]
    fn refuses_a_second_concurrent_build() {
        let graph = tmp_graph_path("busy");
        let _held = BuildLock::acquire(&graph).expect("first acquire must succeed");
        let second = BuildLock::acquire(&graph);
        assert!(
            second.is_err(),
            "a concurrent build must be refused, not allowed to race"
        );
    }

    #[test]
    fn releases_after_the_holder_is_dropped() {
        let graph = tmp_graph_path("sequential");
        {
            let _first = BuildLock::acquire(&graph).expect("first acquire");
        }
        BuildLock::acquire(&graph).expect("must be acquirable once the holder drops");
    }

    /// A crashed build must not block every future build forever. A stuck lock on
    /// a derived cache is worse than one skipped run.
    #[test]
    fn steals_a_stale_lock_from_a_dead_build() {
        let graph = tmp_graph_path("stale");
        let lock_file = BuildLock::lock_path(&graph);
        std::fs::write(&lock_file, "99999\n").expect("write a fake held lock");

        // Backdate past the staleness threshold.
        let old = SystemTime::now() - (STALE_AFTER + Duration::from_secs(5));
        let times = std::fs::FileTimes::new().set_modified(old);
        let handle = std::fs::File::options()
            .write(true)
            .open(&lock_file)
            .expect("reopen fake lock");
        handle.set_times(times).expect("backdate the lock mtime");
        drop(handle);

        BuildLock::acquire(&graph).expect("a stale lock must be stolen");
    }

    #[test]
    fn a_fresh_foreign_lock_is_not_stolen() {
        let graph = tmp_graph_path("fresh");
        std::fs::write(BuildLock::lock_path(&graph), "99999\n").expect("write a fake held lock");
        let result = BuildLock::acquire(&graph);
        assert!(result.is_err(), "a fresh lock must be respected");
        let err = result.expect_err("checked above");
        assert!(err.to_string().contains("in progress"), "got: {err}");
    }

    #[test]
    fn the_lock_sits_beside_the_graph_not_on_top_of_it() {
        let graph = tmp_graph_path("sibling");
        let lock = BuildLock::lock_path(&graph);
        assert_ne!(lock, graph, "the lock must never shadow the graph file");
        assert_eq!(lock.parent(), graph.parent());
    }
}
