---
name: rust-patterns
description: Rust patterns covering ownership, lifetimes, error handling, traits, async with Tokio, and smart pointers. Activate when writing or reviewing Rust.
origin: FlowDeck
---

# Rust Patterns Skill

Safe, idiomatic Rust for production systems. Covers the ownership model, trait system, and async patterns.

## When to Activate

Activate when:
- Writing new Rust crates or services
- Reviewing Rust code for safety and idiom
- Fighting the borrow checker and looking for solutions
- Designing async services with Tokio
- Choosing between smart pointer types

## Ownership and Borrowing — Mental Model

Every value has exactly one owner. When the owner goes out of scope, the value is dropped. References borrow a value without taking ownership.

### The Three Rules

1. Each value has exactly one owner.
2. There can be any number of shared (`&T`) references, OR exactly one exclusive (`&mut T`) reference — never both at the same time.
3. References must not outlive the value they point to.

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1;          // ownership moved to s2
    // println!("{s1}");  // compile error: s1 moved

    let s3 = String::from("world");
    let r1 = &s3;         // shared borrow
    let r2 = &s3;         // another shared borrow — fine
    println!("{r1} {r2}");

    let mut s4 = String::from("mutable");
    let r3 = &mut s4;     // exclusive borrow
    r3.push_str("!");
    // let r4 = &s4;      // compile error: s4 already mutably borrowed
}
```

### Clone When You Need a Copy

```rust
// clone() is explicit and potentially expensive — use it knowingly
let original = vec![1, 2, 3];
let copy = original.clone();
// both are usable

// For cheap copies, implement Copy (stack-allocated types)
#[derive(Clone, Copy)]
struct Point { x: f64, y: f64 }

let p1 = Point { x: 1.0, y: 2.0 };
let p2 = p1;  // copied, not moved — p1 still valid
```

## Lifetime Annotations

The compiler infers lifetimes in most cases via elision rules. Annotate when the compiler cannot determine the relationship.

### When Annotations Are Required

```rust
// Return value borrows from one of the arguments — annotate the relationship
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// Struct holding a reference must declare its lifetime
struct Excerpt<'a> {
    text: &'a str,
}

impl<'a> Excerpt<'a> {
    fn content(&self) -> &str {
        self.text  // lifetime elided — same as self's lifetime
    }
}
```

### Elision Rules (No Annotation Needed)

```rust
// Rule 1: each input reference gets its own lifetime
fn first_word(s: &str) -> &str { ... }
// expanded: fn first_word<'a>(s: &'a str) -> &'a str

// Rule 2: if there's exactly one input lifetime, it applies to all outputs
fn trim(s: &str) -> &str { s.trim() }
```

### 'static — Only When Truly Static

```rust
// String literals have 'static lifetime
let s: &'static str = "I live for the entire program";

// Avoid &'static in generic bounds unless you truly need it — it rules out
// borrowed data entirely and forces owned types or leaked memory
```

## Error Handling

### Result<T, E> and the ? Operator

```rust
use std::fs;
use std::io;

fn read_config(path: &str) -> Result<String, io::Error> {
    let content = fs::read_to_string(path)?;  // ? returns early on Err
    Ok(content.trim().to_owned())
}

// Chaining with map_err to convert error types
fn parse_port(s: &str) -> Result<u16, String> {
    s.parse::<u16>()
     .map_err(|e| format!("invalid port {s:?}: {e}"))
}
```

### thiserror — Library Error Types

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("record {id} not found")]
    NotFound { id: u64 },

    #[error("database error")]
    Database(#[from] sqlx::Error),

    #[error("serialization failed: {0}")]
    Serialize(#[from] serde_json::Error),
}

// Callers can pattern-match on variants
match store.get(id).await {
    Err(StoreError::NotFound { id }) => respond_404(id),
    Err(e) => respond_500(e),
    Ok(record) => respond_200(record),
}
```

### anyhow — Application Error Handling

```rust
use anyhow::{Context, Result};

// anyhow::Result<T> = Result<T, anyhow::Error>
async fn run() -> Result<()> {
    let config = load_config("app.toml")
        .context("failed to load application config")?;

    let db = connect(&config.database_url).await
        .context("database connection failed")?;

    serve(db, config.port).await
}

// context() attaches a message; with_context() is lazy (use for expensive messages)
let data = fetch(url).await
    .with_context(|| format!("fetch failed for url: {url}"))?;
```

## Trait System

### impl Trait — Static Dispatch

```rust
// Return an opaque type — compiler monomorphises at call site
fn make_greeting(name: &str) -> impl Display {
    format!("Hello, {name}!")
}

// Accept any type implementing a trait — zero-cost abstraction
fn print_all(items: &[impl Display]) {
    for item in items {
        println!("{item}");
    }
}
```

### dyn Trait — Dynamic Dispatch

```rust
// Trait objects — runtime dispatch, heap-allocated
fn make_handler(kind: &str) -> Box<dyn Handler> {
    match kind {
        "log"   => Box::new(LogHandler::new()),
        "audit" => Box::new(AuditHandler::new()),
        _       => Box::new(NoopHandler),
    }
}

// Object safety rules: no generic methods, no Self return types
// Use dyn Trait only when you need heterogeneous collections or
// when the concrete type isn't known until runtime
```

### Where Clauses for Readability

```rust
// Inline bounds get crowded
fn process<T: Debug + Clone + Send + 'static>(item: T) { ... }

// Where clause is cleaner
fn process<T>(item: T)
where
    T: Debug + Clone + Send + 'static,
{
    ...
}
```

### Blanket Implementations

```rust
// Implement a trait for all types that satisfy a constraint
impl<T: Display> MyPrint for T {
    fn print(&self) { println!("{self}"); }
}
```

## Iterators

Iterators are lazy — no work until consumed. Chain adapters freely; the compiler fuses them.

```rust
let result: Vec<String> = (1..=10)
    .filter(|n| n % 2 == 0)
    .map(|n| n * n)
    .take(3)
    .map(|n| format!("n={n}"))
    .collect();
// ["n=4", "n=16", "n=36"]

// fold — general reduction
let product: u64 = (1..=10).fold(1, |acc, n| acc * n);

// chain — concatenate iterators
let combined: Vec<i32> = vec![1, 2].into_iter()
    .chain(vec![3, 4].into_iter())
    .collect();

// Custom iterator
struct Counter { count: u32, max: u32 }

impl Iterator for Counter {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if self.count < self.max {
            self.count += 1;
            Some(self.count)
        } else {
            None
        }
    }
}
```

## Async/Await with Tokio

### Spawning Tasks

```rust
use tokio::task;

#[tokio::main]
async fn main() {
    let handle: task::JoinHandle<u64> = tokio::spawn(async {
        compute_heavy_thing().await
    });

    let result = handle.await.expect("task panicked");
}
```

### select! — Racing Futures

```rust
use tokio::select;
use tokio::time::{sleep, Duration};

async fn with_timeout<T>(fut: impl Future<Output = T>, ms: u64) -> Option<T> {
    select! {
        result = fut => Some(result),
        _ = sleep(Duration::from_millis(ms)) => None,
    }
}
```

### Channels

```rust
use tokio::sync::{mpsc, oneshot};

// mpsc — multiple producers, single consumer
let (tx, mut rx) = mpsc::channel::<String>(32);  // bounded, backpressure

tokio::spawn(async move {
    while let Some(msg) = rx.recv().await {
        process(msg).await;
    }
});

tx.send("hello".to_owned()).await.unwrap();

// oneshot — single response (request/reply pattern)
let (resp_tx, resp_rx) = oneshot::channel::<Result<User, StoreError>>();

tokio::spawn(async move {
    let user = db.find_user(id).await;
    let _ = resp_tx.send(user);
});

let user = resp_rx.await.expect("worker dropped");
```

## Smart Pointers

| Type | Ownership | Thread-safe | Interior mutability |
|------|-----------|-------------|---------------------|
| `Box<T>` | owned, heap | yes (if T: Send) | no |
| `Rc<T>` | shared, heap | ❌ no | no |
| `Arc<T>` | shared, heap | ✅ yes | no |
| `RefCell<T>` | owned | ❌ no | ✅ runtime borrow |
| `Mutex<T>` | owned | ✅ yes | ✅ locked |
| `RwLock<T>` | owned | ✅ yes | ✅ locked |

```rust
// Box — when you need heap allocation or unsized types
let large: Box<[u8; 1_000_000]> = Box::new([0; 1_000_000]);

// Arc — shared ownership across threads
let shared = Arc::new(Config::load());
let clone = Arc::clone(&shared);
tokio::spawn(async move { use_config(clone).await });

// Arc<Mutex<T>> — shared mutable state across threads
let counter = Arc::new(Mutex::new(0u64));
let c = Arc::clone(&counter);
tokio::spawn(async move {
    *c.lock().await += 1;
});

// Rc<RefCell<T>> — shared mutable state in single-threaded contexts
let node = Rc::new(RefCell::new(Node::new()));
node.borrow_mut().value = 42;
```

## Enums and Pattern Matching

```rust
#[derive(Debug)]
enum Command {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(u8, u8, u8),
}

fn execute(cmd: Command) {
    match cmd {
        Command::Quit => println!("quit"),
        Command::Move { x, y } => println!("move to ({x},{y})"),
        Command::Write(msg) => println!("write: {msg}"),
        Command::ChangeColor(r, g, b) => println!("color: #{r:02x}{g:02x}{b:02x}"),
    }
}

// if let — when only one variant matters
if let Some(value) = map.get("key") {
    println!("found: {value}");
}

// while let — consume until variant changes
let mut stack = vec![1, 2, 3];
while let Some(top) = stack.pop() {
    println!("{top}");
}
```

## Cargo Workspace and Features

### Workspace

```toml
# Cargo.toml at root
[workspace]
members = ["crates/core", "crates/api", "crates/cli"]
resolver = "2"

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
```

### Conditional Compilation with Features

```toml
# crates/core/Cargo.toml
[features]
default = []
metrics = ["dep:prometheus"]
tracing = ["dep:tracing-subscriber"]

[dependencies]
prometheus = { version = "0.13", optional = true }
```

```rust
#[cfg(feature = "metrics")]
fn record_metric(name: &str, value: f64) {
    prometheus::counter!(name).inc_by(value);
}

#[cfg(not(feature = "metrics"))]
fn record_metric(_name: &str, _value: f64) {}
```

## Common Pitfalls

### Fighting the Borrow Checker — Solutions

```rust
// Problem: returning a reference to something inside a match
// Solution: clone or restructure to return owned data

// Problem: two mutable references to different fields of a struct
struct Grid { rows: Vec<Vec<i32>>, count: usize }
impl Grid {
    fn swap_and_count(&mut self, r1: usize, r2: usize) {
        // borrow checker rejects: &mut self.rows and &mut self.count at once
        // Solution: split borrows by borrowing fields directly
        let (rows, count) = (&mut self.rows, &mut self.count);
        rows.swap(r1, r2);
        *count += 1;
    }
}

// Problem: value moved in loop
// Solution: borrow or clone before the loop, or use indices
for item in &items {          // borrow — items still usable after loop
    process(item);
}
for item in items.iter() {   // same as above, explicit
    process(item);
}
```

### String vs &str vs &[u8]

```rust
// &str — borrowed string slice — use in function parameters when you don't need ownership
fn greet(name: &str) -> String { format!("Hello, {name}!") }

// String — owned, heap-allocated, growable — return types, struct fields
struct User { name: String }

// &[u8] — raw bytes — use for binary data or when encoding is uncertain
fn checksum(data: &[u8]) -> u32 { ... }

// Vec<u8> — owned bytes — when you need to mutate or own binary data
```

### Copy vs Clone

```rust
// Copy types are silently duplicated on assignment (all stack data: i32, bool, char, &T, arrays of Copy)
let x: i32 = 5;
let y = x;  // x is still valid — i32 implements Copy

// Clone is explicit — use when the duplication is intentional and potentially expensive
#[derive(Clone)]  // opt in
struct Config { /* ... */ }

let c1 = Config::load();
let c2 = c1.clone();  // explicit, reader knows a copy was made

// Do not implement Copy for types with heap data — it creates shallow copies
// that would double-free. The compiler prevents this for types with Drop.
```
