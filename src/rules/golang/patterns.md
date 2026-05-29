---
description: Go conventions — error handling, goroutines, interfaces, testing with t.Run
always_on: false
stages: [execute, fix-bug, verify]
languages: [go]
---

# Go Patterns

Go conventions for FlowDeck projects.

## Always Handle Errors Explicitly

Never discard error return values with `_`. Every error must be checked and either handled or propagated.

```go
// ❌ Silently discarding the error
result, _ := parseConfig(path)

// ✅ Check and handle or propagate
result, err := parseConfig(path)
if err != nil {
    return fmt.Errorf("startup: %w", err)
}
```

## Error String Style

Error strings must be lowercase and have no trailing punctuation. They are often wrapped and appear mid-sentence in logs.

```go
// ❌ Uppercase, trailing period
errors.New("Connection refused.")

// ✅ Lowercase, no trailing punctuation
errors.New("connection refused")
fmt.Errorf("user %d: record not found", id)
```

## Interface Naming

- Single-method interfaces: use the method name with the `-er` suffix.
- Multi-method interfaces: use a noun that describes the role.

```go
// ✅ Single-method
type Reader interface { Read(p []byte) (int, error) }
type Stringer interface { String() string }
type Notifier interface { Notify(ctx context.Context, msg Message) error }

// ✅ Multi-method
type UserStore interface {
    FindByID(ctx context.Context, id int64) (*User, error)
    Save(ctx context.Context, u *User) error
}
```

## Exported Names Must Have Doc Comments

Every exported function, type, method, and variable requires a doc comment beginning with the name.

```go
// ❌ Missing doc comment
func ProcessOrder(o *Order) error { ... }

// ✅ Doc comment starting with the name
// ProcessOrder validates and persists an order, charging the associated payment method.
func ProcessOrder(o *Order) error { ... }
```

## context.Context as First Parameter

All functions that perform I/O, call external services, or could be long-running must accept `context.Context` as their first parameter.

```go
// ❌ No context — cannot be cancelled or carry deadlines
func FetchUser(id int64) (*User, error) { ... }

// ✅ context.Context first
func FetchUser(ctx context.Context, id int64) (*User, error) { ... }
```

## Never panic for Expected Errors

Use `panic` only for programmer errors (invariant violations, impossible states). Use error returns for expected failure modes.

```go
// ❌ panic for expected failure
func ParseConfig(data []byte) Config {
    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        panic(err)  // config may be invalid at runtime — this is expected
    }
    return cfg
}

// ✅ Return error for expected failure
func ParseConfig(data []byte) (Config, error) {
    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        return Config{}, fmt.Errorf("parse config: %w", err)
    }
    return cfg, nil
}
```

## Table-Driven Tests

Any function with more than one meaningful input/output combination requires a table-driven test using `t.Run`.

```go
func TestDivide(t *testing.T) {
    cases := []struct {
        name    string
        a, b    float64
        want    float64
        wantErr bool
    }{
        {name: "simple division", a: 10, b: 2, want: 5},
        {name: "divide by zero", a: 5, b: 0, wantErr: true},
        {name: "negative divisor", a: 9, b: -3, want: -3},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            got, err := Divide(tc.a, tc.b)
            if (err != nil) != tc.wantErr {
                t.Fatalf("Divide(%v, %v) err = %v, wantErr %v", tc.a, tc.b, err, tc.wantErr)
            }
            if !tc.wantErr && got != tc.want {
                t.Errorf("Divide(%v, %v) = %v, want %v", tc.a, tc.b, got, tc.want)
            }
        })
    }
}
```

## Static Analysis

All code must pass:

```bash
go vet ./...
staticcheck ./...
golangci-lint run
```

Run these in CI before merge. Do not suppress linter warnings without a comment explaining why.

## Avoid Global State

Prefer dependency injection via struct fields over package-level variables. Global state makes testing and concurrent use difficult.

```go
// ❌ Package-level global
var defaultClient = &http.Client{Timeout: 10 * time.Second}

func Fetch(url string) ([]byte, error) {
    resp, err := defaultClient.Get(url)
    ...
}

// ✅ Injected via struct
type APIClient struct {
    http *http.Client
}

func NewAPIClient(http *http.Client) *APIClient {
    return &APIClient{http: http}
}

func (c *APIClient) Fetch(ctx context.Context, url string) ([]byte, error) {
    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    resp, err := c.http.Do(req)
    ...
}
```

## Never Start Goroutines in init() or Package-Level Vars

Goroutines started at package init time cannot be cancelled, cannot propagate errors, and make test isolation impossible.

```go
// ❌ Goroutine in init
func init() {
    go backgroundWorker()  // leaks, cannot cancel, runs in every test
}

// ✅ Start goroutines from an explicit lifecycle method
type Worker struct { done chan struct{} }

func (w *Worker) Start(ctx context.Context) {
    go w.run(ctx)
}
```
