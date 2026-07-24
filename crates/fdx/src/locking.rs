//! File-level advisory locks with append helpers.
//!
//! Matches the existing TypeScript semantics in `src/tools/planning-state-lib.ts:appendWithLock`:
//! - Poll for lock acquisition up to `LOCK_ACQUIRE_TIMEOUT_MS` (1s default).
//! - On timeout, fall back to an "unlocked" append with a stderr warning.
//! - No stale-lock stealing — that behavior was intentionally NOT ported (the
//!   design doc's T6 finding recorded the decision to preserve TS behavior 1:1).
//!
//! Lock implementation uses a sidecar file with a "wx" exclusive create. This
//! is the Rust analog of TS `writeFileSync(path, ..., { flag: "wx" })` and gives
//! us atomic check-and-claim semantics on POSIX filesystems.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::{Duration, Instant};

/// Polling interval (ms) when waiting for a held lock.
const LOCK_POLL_MS: u64 = 50;

/// Total time (ms) we will wait to acquire a lock before falling through.
pub const LOCK_ACQUIRE_TIMEOUT_MS: u64 = 1_000;

/// Lock sidecar file name (sibling of the data file with `.lock` suffix).
fn lock_path(data_path: &Path) -> PathBuf {
    let mut p = data_path.as_os_str().to_owned();
    p.push(".lock");
    PathBuf::from(p)
}

/// Try to claim the lock for `data_path`. Returns `true` on success.
fn try_claim(data_path: &Path) -> bool {
    let lock = lock_path(data_path);
    // Ensure parent directory exists before claiming.
    if let Some(parent) = lock.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                eprintln!("[lock] create_dir_all failed: {e}");
                return false;
            }
        }
    }
    let pid = std::process::id();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock)
    {
        Ok(mut f) => {
            let _ = writeln!(f, "{}:{}", pid, ts);
            true
        }
        Err(_) => false,
    }
}

/// Release the lock if we hold it. Best-effort: ignores errors.
fn release(data_path: &Path) {
    let lock = lock_path(data_path);
    let _ = fs::remove_file(&lock);
}

/// Append `line` to `data_path` under an advisory lock. If the lock cannot be
/// acquired within `LOCK_ACQUIRE_TIMEOUT_MS`, prints a stderr warning and
/// appends unlocked.
///
/// `line` should include any trailing newline the caller wants.
pub fn append_with_lock(data_path: &Path, line: &str) {
    let start = Instant::now();
    let timeout = Duration::from_millis(LOCK_ACQUIRE_TIMEOUT_MS);
    let poll = Duration::from_millis(LOCK_POLL_MS);

    let acquired = loop {
        if try_claim(data_path) {
            break true;
        }
        if start.elapsed() >= timeout {
            break false;
        }
        sleep(poll);
    };

    if !acquired {
        eprintln!(
            "[appendWithLock] lock contention timeout for {} after {}ms; appending unlocked",
            data_path.display(),
            LOCK_ACQUIRE_TIMEOUT_MS
        );
    }

    // Ensure parent dir exists.
    if let Some(parent) = data_path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                eprintln!("[appendWithLock] mkdir failed: {e}");
                if acquired {
                    release(data_path);
                }
                return;
            }
        }
    }

    // Append.
    let result = OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_path)
        .and_then(|mut f| f.write_all(line.as_bytes()));

    if let Err(e) = result {
        eprintln!("[appendWithLock] write failed for {}: {}", data_path.display(), e);
    }

    if acquired {
        release(data_path);
    }
}

/// Truncate `data_path` to empty under an advisory lock. Idempotent — safe
/// when the file does not exist.
///
/// Mirrors `src/tools/planning-state-lib.ts:clearFileWithLock`.
pub fn clear_file_with_lock(data_path: &Path) {
    let start = Instant::now();
    let timeout = Duration::from_millis(LOCK_ACQUIRE_TIMEOUT_MS);
    let poll = Duration::from_millis(LOCK_POLL_MS);

    let acquired = loop {
        if try_claim(data_path) {
            break true;
        }
        if start.elapsed() >= timeout {
            break false;
        }
        sleep(poll);
    };

    if !acquired {
        eprintln!(
            "[clearFileWithLock] lock contention timeout for {} after {}ms; clearing unlocked",
            data_path.display(),
            LOCK_ACQUIRE_TIMEOUT_MS
        );
    }

    // Only clear if the file exists. Mirrors TS `if (existsSync(path))`.
    if data_path.exists() {
        if let Err(e) = fs::write(data_path, "") {
            eprintln!(
                "[clearFileWithLock] write failed for {}: {}",
                data_path.display(),
                e
            );
        }
    }

    if acquired {
        release(data_path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::sync::{Arc, Barrier};
    use std::thread;

    fn tmp_dir() -> PathBuf {
        let mut p = env::temp_dir();
        let pid = std::process::id();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        p.push(format!("fdx-locking-test-{}-{}", pid, nanos));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn append_creates_file_and_writes() {
        let dir = tmp_dir();
        let p = dir.join("a.md");
        append_with_lock(&p, "first\n");
        assert_eq!(fs::read_to_string(&p).unwrap(), "first\n");
        append_with_lock(&p, "second\n");
        assert_eq!(fs::read_to_string(&p).unwrap(), "first\nsecond\n");
    }

    #[test]
    fn clear_idempotent_on_missing() {
        let dir = tmp_dir();
        let p = dir.join("missing.md");
        clear_file_with_lock(&p); // no panic, no error
        assert!(!p.exists());
    }

    #[test]
    fn concurrent_appends_both_succeed() {
        let dir = tmp_dir();
        let p = dir.join("concurrent.md");
        let barrier = Arc::new(Barrier::new(2));
        let p1 = p.clone();
        let p2 = p.clone();
        let b1 = Arc::clone(&barrier);
        let b2 = Arc::clone(&barrier);
        let h1 = thread::spawn(move || {
            b1.wait();
            for _ in 0..20 {
                append_with_lock(&p1, "a\n");
            }
        });
        let h2 = thread::spawn(move || {
            b2.wait();
            for _ in 0..20 {
                append_with_lock(&p2, "b\n");
            }
        });
        h1.join().unwrap();
        h2.join().unwrap();
        let content = fs::read_to_string(&p).unwrap();
        let a_count = content.matches("a\n").count();
        let b_count = content.matches("b\n").count();
        // Both threads should successfully append all their lines (possibly
        // interleaved), giving 20 a's and 20 b's.
        assert_eq!(a_count, 20);
        assert_eq!(b_count, 20);
    }
}
