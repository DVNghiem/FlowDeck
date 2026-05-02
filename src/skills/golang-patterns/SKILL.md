---
name: golang-patterns
description: Idiomatic Go patterns covering error handling, interfaces, goroutines, channels, testing, and common pitfalls. Activate when writing or reviewing Go code.
origin: FlowDeck
---

# Go Patterns Skill

Idiomatic Go for production systems. Focuses on simplicity, explicitness, and composition.

## When to Activate

Activate when:
- Writing new Go packages or services
- Reviewing Go code for idiom and correctness
- Designing concurrent processing pipelines
- Debugging goroutine leaks or race conditions
- Setting up module structure or build configuration

## Error Handling

Go errors are values. Handle them at the point where you have enough context to act.

### Wrapping and Unwrapping

```go
import "errors"
import "fmt"

// Wrap with %w to preserve the chain
func loadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("loadConfig %q: %w", path, err)
    }
    // ...
}

// Inspect with errors.Is (sentinel) and errors.As (type)
var ErrNotFound = errors.New("not found")

if err := loadConfig("app.yaml"); err != nil {
    if errors.Is(err, os.ErrNotExist) {
        // file missing
    }
    var pathErr *os.PathError
    if errors.As(err, &pathErr) {
        log.Printf("path problem: %s", pathErr.Path)
    }
}
```

### Sentinel Errors

```go
// Define at package level, exported when callers need to check
var (
    ErrNotFound   = errors.New("not found")
    ErrPermission = errors.New("permission denied")
)

// Prefer typed errors when you need to attach data
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation: %s %s", e.Field, e.Message)
}
```

### Error String Conventions

```go
// ✅ lowercase, no trailing punctuation
errors.New("connection refused")
fmt.Errorf("user %d not found", id)

// ❌ uppercase or punctuation
errors.New("Connection refused.")
```

## Interface Design

Keep interfaces small. A one-method interface is a feature, not a limitation.

### The io.Reader / io.Writer Pattern

```go
// Standard library interfaces — use them where they fit
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

// Compose for more complex contracts
type ReadWriter interface {
    Reader
    Writer
}

// Accept interfaces, return concrete types
func Process(r io.Reader) ([]byte, error) {
    return io.ReadAll(r)
}

// os.File, bytes.Buffer, http.Response.Body all satisfy io.Reader
```

### Define Interfaces at the Consumer

```go
// ❌ Defining in the producer package forces coupling
package store
type Repository interface { ... }  // in the store package

// ✅ Define in the consumer package
package service
type userStore interface {
    FindByID(ctx context.Context, id int64) (*User, error)
    Save(ctx context.Context, u *User) error
}

type UserService struct {
    store userStore
}
```

### Single-Method Naming

```go
// Verb + "er" for single-method interfaces
type Reader interface { Read(...) }
type Writer interface { Write(...) }
type Stringer interface { String() string }
type Closer interface { Close() error }
type Handler interface { ServeHTTP(...) }
```

## Goroutines and Channels

### Worker Pool Pattern

```go
func workerPool(ctx context.Context, jobs <-chan Job, workers int) <-chan Result {
    results := make(chan Result)

    var wg sync.WaitGroup
    wg.Add(workers)
    for range workers {
        go func() {
            defer wg.Done()
            for job := range jobs {
                select {
                case results <- process(job):
                case <-ctx.Done():
                    return
                }
            }
        }()
    }

    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}
```

### Fan-Out / Fan-In

```go
// Fan-out: send work to N goroutines
func fanOut(in <-chan int, n int) []<-chan int {
    outs := make([]<-chan int, n)
    for i := range n {
        ch := make(chan int)
        outs[i] = ch
        go func() {
            defer close(ch)
            for v := range in {
                ch <- v * 2
            }
        }()
    }
    return outs
}

// Fan-in: merge N channels into one
func merge(channels ...<-chan int) <-chan int {
    out := make(chan int)
    var wg sync.WaitGroup
    wg.Add(len(channels))
    for _, ch := range channels {
        go func(c <-chan int) {
            defer wg.Done()
            for v := range c {
                out <- v
            }
        }(ch)
    }
    go func() {
        wg.Wait()
        close(out)
    }()
    return out
}
```

### Select and Context Cancellation

```go
func doWork(ctx context.Context) error {
    ticker := time.NewTicker(500 * time.Millisecond)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case t := <-ticker.C:
            if err := tick(t); err != nil {
                return fmt.Errorf("tick: %w", err)
            }
        }
    }
}
```

### Channel Ownership Rule

The goroutine that creates a channel is responsible for closing it. Closing a channel from a reader or having multiple goroutines close the same channel causes panics.

## Struct Embedding vs Composition

### Embedding for Behaviour Promotion

```go
type Logger struct {
    level string
}

func (l *Logger) Log(msg string) {
    fmt.Printf("[%s] %s\n", l.level, msg)
}

type Server struct {
    Logger           // promotes Log method
    addr   string
}

s := Server{Logger: Logger{level: "INFO"}, addr: ":8080"}
s.Log("starting")   // calls s.Logger.Log
```

### Prefer Explicit Fields for Data

```go
// ❌ Embedding for data models creates implicit API surface
type FullUser struct {
    User    // every User field/method becomes part of FullUser's API
    Profile
}

// ✅ Explicit fields make dependencies obvious
type FullUser struct {
    User    User
    Profile Profile
}
```

## defer, panic, recover

### defer — Always for Cleanup

```go
func writeFile(path string, data []byte) error {
    f, err := os.Create(path)
    if err != nil {
        return err
    }
    defer f.Close()  // runs even if Write returns error

    _, err = f.Write(data)
    return err
}

// defer evaluates arguments immediately — useful for timing
func trace(name string) func() {
    start := time.Now()
    return func() { log.Printf("%s: %v", name, time.Since(start)) }
}
defer trace("expensiveOp")()
```

### panic / recover — Only at Boundaries

```go
// Use panic only for programmer errors (invariant violations)
func mustPositive(n int) int {
    if n <= 0 {
        panic(fmt.Sprintf("expected positive, got %d", n))
    }
    return n
}

// Recover at the top of a goroutine or HTTP handler to convert to error
func safeExec(fn func()) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic: %v", r)
        }
    }()
    fn()
    return nil
}
```

Never use panic/recover as a substitute for regular error handling.

## Table-Driven Tests

```go
func TestParseDate(t *testing.T) {
    cases := []struct {
        name    string
        input   string
        want    time.Time
        wantErr bool
    }{
        {
            name:  "ISO format",
            input: "2024-01-15",
            want:  time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
        },
        {
            name:    "empty string",
            input:   "",
            wantErr: true,
        },
        {
            name:    "invalid format",
            input:   "15/01/2024",
            wantErr: true,
        },
    }

    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            got, err := ParseDate(tc.input)
            if (err != nil) != tc.wantErr {
                t.Fatalf("ParseDate(%q) error = %v, wantErr %v", tc.input, err, tc.wantErr)
            }
            if !tc.wantErr && !got.Equal(tc.want) {
                t.Errorf("ParseDate(%q) = %v, want %v", tc.input, got, tc.want)
            }
        })
    }
}
```

## Go Modules

### go.mod Structure

```
module github.com/org/myservice

go 1.23

require (
    github.com/some/dep v1.2.3
)
```

### Workspace Mode (go.work) for Multi-Module Repos

```
go 1.23

use (
    ./cmd/api
    ./internal/core
    ./pkg/client
)
```

```bash
go work init ./cmd/api ./internal/core
go work use ./pkg/client
```

### Module Commands

```bash
go mod tidy          # add missing, remove unused
go mod vendor        # copy deps to vendor/
go get github.com/x@v1.2.3  # add or upgrade
go mod why github.com/x     # explain why dep is needed
```

## sync Package

```go
var mu sync.Mutex
mu.Lock()
defer mu.Unlock()

// RWMutex — many readers, one writer
var rw sync.RWMutex
rw.RLock()
defer rw.RUnlock()

// WaitGroup — wait for goroutines to finish
var wg sync.WaitGroup
wg.Add(1)
go func() {
    defer wg.Done()
    // ...
}()
wg.Wait()

// Once — run exactly once (e.g., lazy init)
var once sync.Once
var instance *DB
func getDB() *DB {
    once.Do(func() { instance = newDB() })
    return instance
}

// Atomic operations — simple counters without a mutex
var counter atomic.Int64
counter.Add(1)
n := counter.Load()
```

## Build Tags

```go
//go:build linux && amd64

package platform

// This file only compiles on 64-bit Linux.
func pageSize() int { return 4096 }
```

```bash
go build -tags integration ./...
go test -tags integration ./...
```

## Common Pitfalls

### Goroutine Leaks

```go
// ❌ Nothing reads from results — goroutines block forever
func leak() {
    results := make(chan int)
    go func() { results <- compute() }()
    // forgot to read results
}

// ✅ Always ensure goroutines can exit — use buffered channels or context
func noLeak(ctx context.Context) {
    results := make(chan int, 1)
    go func() {
        select {
        case results <- compute():
        case <-ctx.Done():
        }
    }()
}
```

### nil Interface vs nil Pointer

```go
// ❌ Returning a typed nil as an interface is NOT nil
func getErr() error {
    var p *os.PathError = nil
    return p  // error interface is not nil!
}

// ✅ Return untyped nil
func getErr() error {
    return nil
}
```

### Map Race Conditions

```go
// ❌ Concurrent read/write on map causes data race
m := map[string]int{}
go func() { m["a"] = 1 }()
go func() { _ = m["a"] }()

// ✅ Use sync.Map or protect with a mutex
var mu sync.RWMutex
mu.Lock()
m["a"] = 1
mu.Unlock()
```
