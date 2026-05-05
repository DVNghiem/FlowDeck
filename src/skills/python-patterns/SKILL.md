---
name: python-patterns
description: Python-specific idioms and patterns covering type hints, dataclasses, async/await, generators, testing with pytest, and common pitfalls. Activate when writing or reviewing Python code.
origin: FlowDeck
---

# Python Patterns Skill

Idiomatic Python for production-grade code. Covers modern Python 3.10+ practices.

## When to Activate

Activate when:
- Writing new Python modules or packages
- Reviewing Python code for correctness and idiom
- Deciding between data modeling approaches (dataclass vs TypedDict vs Pydantic)
- Designing async services or background workers
- Setting up testing infrastructure

## Type Hints

Python's type system (PEP 484, 526, 544) makes code self-documenting and enables static analysis with mypy or pyright.

### Basic Annotations

```python
# Variables (PEP 526)
count: int = 0
names: list[str] = []
mapping: dict[str, int] = {}

# Functions — always annotate public API
def greet(name: str, times: int = 1) -> str:
    return (f"Hello, {name}!\n" * times).rstrip()

# Optional and Union (Python 3.10+ union syntax preferred)
def find_user(user_id: int) -> "User | None":
    ...

# Use TypeAlias for reused complex types
type UserId = int          # Python 3.12+
UserId = NewType("UserId", int)  # pre-3.12
```

### Protocols (PEP 544) — Structural Subtyping

Prefer Protocol over ABC when you don't control the implementor.

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class Serializable(Protocol):
    def to_dict(self) -> dict[str, object]: ...

def save(obj: Serializable) -> None:
    data = obj.to_dict()
    ...

# Any class with to_dict() satisfies Serializable — no inheritance required
```

### Generics

```python
from typing import TypeVar, Generic

T = TypeVar("T")

class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()
```

## Data Modeling: Dataclass vs TypedDict vs Pydantic

Choose based on where the data lives and what guarantees you need.

### Dataclass — in-memory objects with behavior

```python
from dataclasses import dataclass, field

@dataclass
class Order:
    id: str
    items: list[str] = field(default_factory=list)
    total: float = 0.0

    def add_item(self, item: str, price: float) -> None:
        self.items.append(item)
        self.total += price

# Use @dataclass(frozen=True) for immutable value objects
@dataclass(frozen=True)
class Money:
    amount: int   # stored in cents
    currency: str = "USD"
```

### TypedDict — typed dictionaries, no runtime overhead

Best for function signatures that accept/return dict-shaped data (JSON responses, kwargs).

```python
from typing import TypedDict, NotRequired

class UserPayload(TypedDict):
    id: str
    email: str
    name: NotRequired[str]  # optional key

def process(payload: UserPayload) -> None:
    print(payload["id"])   # static checker knows the type
```

### Pydantic — validation at the boundary

Use at I/O boundaries: API request bodies, config files, deserialized data.

```python
from pydantic import BaseModel, Field, field_validator

class CreateUserRequest(BaseModel):
    email: str
    age: int = Field(gt=0, lt=150)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("email")
    @classmethod
    def email_must_have_at(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("not a valid email")
        return v.lower()

# Pydantic raises ValidationError with structured detail on bad input
req = CreateUserRequest(email="ALICE@EXAMPLE.COM", age=30, name="Alice")
# req.email == "alice@example.com"
```

**Decision rule:** dataclass for domain objects with behavior → TypedDict for dicts that stay dicts → Pydantic for external input validation.

## Context Managers

The `with` statement guarantees cleanup whether or not an exception occurs.

### Using `contextlib`

```python
from contextlib import contextmanager, asynccontextmanager

@contextmanager
def managed_connection(dsn: str):
    conn = connect(dsn)
    try:
        yield conn
    finally:
        conn.close()

# Usage
with managed_connection("postgresql://...") as conn:
    conn.execute("SELECT 1")
```

### Class-Based Context Managers

```python
class Timer:
    def __enter__(self) -> "Timer":
        import time
        self._start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        self.elapsed = time.perf_counter() - self._start
        return False  # don't suppress exceptions

with Timer() as t:
    expensive_operation()
print(f"Took {t.elapsed:.3f}s")
```

### Suppressing Exceptions

```python
from contextlib import suppress

with suppress(FileNotFoundError):
    Path("optional.txt").unlink()
```

## Generator and Iterator Patterns

Generators yield values lazily — use them for large sequences or pipelines.

### Basic Generator

```python
def read_chunks(path: str, size: int = 8192):
    with open(path, "rb") as f:
        while chunk := f.read(size):
            yield chunk

# Entire file never loaded at once
for chunk in read_chunks("large.bin"):
    process(chunk)
```

### Generator Pipelines

```python
def parse_lines(lines):
    for line in lines:
        yield line.strip()

def filter_comments(lines):
    for line in lines:
        if not line.startswith("#"):
            yield line

def process_file(path: str):
    raw = open(path)
    stripped = parse_lines(raw)
    meaningful = filter_comments(stripped)
    return meaningful  # lazy, no I/O yet
```

### `itertools` for Composition

```python
import itertools

# Flatten a list of lists
flat = list(itertools.chain.from_iterable([[1, 2], [3, 4]]))

# Sliding window
def windows(iterable, n):
    iters = itertools.tee(iterable, n)
    for i, it in enumerate(iters):
        next(itertools.islice(it, i, i), None)
    return zip(*iters)
```

## Asyncio Patterns

Use `async/await` for I/O-bound concurrency. Don't use it for CPU-bound work (use `multiprocessing` instead).

### Async HTTP: httpx vs aiohttp

```python
# httpx — recommended for most cases (sync and async API, HTTP/2)
import httpx

async def fetch_user(user_id: int) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://api.example.com/users/{user_id}")
        resp.raise_for_status()
        return resp.json()

# aiohttp — use when you need streaming or websockets
import aiohttp

async def stream_large_file(url: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            async for chunk in resp.content.iter_chunked(8192):
                process(chunk)
```

### Concurrent Tasks

```python
import asyncio

# Run independent I/O operations concurrently
async def fetch_all(ids: list[int]) -> list[dict]:
    async with httpx.AsyncClient() as client:
        tasks = [fetch_one(client, id) for id in ids]
        return await asyncio.gather(*tasks)

# Timeout and cancellation
async def with_timeout(coro, seconds: float):
    try:
        return await asyncio.wait_for(coro, timeout=seconds)
    except asyncio.TimeoutError:
        raise TimeoutError(f"operation exceeded {seconds}s")
```

### Event Loop Best Practices

```python
# Don't call asyncio.get_event_loop() in new code — use asyncio.run()
if __name__ == "__main__":
    asyncio.run(main())

# For libraries, accept a running loop rather than creating one
async def library_function() -> None:
    loop = asyncio.get_running_loop()  # raises if not inside async context
    ...
```

## Comprehensions — When to Use vs Loops

Comprehensions communicate intent at a glance. Loops are clearer for side effects.

```python
# ✅ Comprehension: transform + filter, no side effects
active_names = [u.name for u in users if u.is_active]
index = {u.id: u for u in users}
unique_tags = {tag for post in posts for tag in post.tags}

# ✅ Generator expression: same as list comprehension but lazy
total = sum(item.price for item in cart)

# ❌ Comprehension with side effects — use a loop
[print(x) for x in items]   # bad
for x in items:              # good
    print(x)

# ❌ Deeply nested comprehensions — use a loop
matrix = [[col * row for col in range(5)] for row in range(5)]  # fine
# but three levels deep: write a loop
```

## Exception Hierarchy and Custom Exceptions

Define a base exception per module/package and branch from it.

```python
# exceptions.py
class AppError(Exception):
    """Base for all application errors."""

class NotFoundError(AppError):
    def __init__(self, resource: str, id: object) -> None:
        super().__init__(f"{resource} {id!r} not found")
        self.resource = resource
        self.id = id

class ValidationError(AppError):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(f"{field}: {message}")
        self.field = field

# Catching
try:
    get_user(user_id)
except NotFoundError as exc:
    return 404, {"error": str(exc)}
except AppError as exc:
    logger.exception("unexpected app error")
    return 500, {"error": "internal error"}

# Exception chaining — always preserve cause
try:
    result = json.loads(raw)
except json.JSONDecodeError as exc:
    raise ValidationError("body", "invalid JSON") from exc
```

## Dependency Management

### pyproject.toml (PEP 518/621)

```toml
[project]
name = "my-service"
version = "1.0.0"
requires-python = ">=3.11"
dependencies = [
    "httpx>=0.27",
    "pydantic>=2.0",
]

[project.optional-dependencies]
dev = ["pytest>=8", "mypy", "ruff"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

### uv — fast package manager

```bash
# Create and activate venv
uv venv && source .venv/bin/activate

# Install project with dev deps
uv pip install -e ".[dev]"

# Add a dependency (updates pyproject.toml)
uv add httpx

# Lock for reproducibility
uv lock
```

### poetry — alternative with integrated lock file

```bash
poetry new my-project
poetry add httpx pydantic
poetry add --group dev pytest mypy
poetry run pytest
```

## Testing with pytest

### Fixtures

```python
import pytest
from myapp.db import Database

@pytest.fixture
def db():
    database = Database(":memory:")
    database.migrate()
    yield database
    database.close()

@pytest.fixture
def user(db):
    return db.create_user(email="alice@example.com", name="Alice")

def test_user_lookup(db, user):
    found = db.get_user(user.id)
    assert found.email == user.email
```

### Parametrize

```python
@pytest.mark.parametrize("email,valid", [
    ("alice@example.com", True),
    ("no-at-sign", False),
    ("@nodomain", False),
    ("spaces @x.com", False),
])
def test_email_validation(email: str, valid: bool) -> None:
    assert validate_email(email) == valid
```

### Mocking

```python
from unittest.mock import AsyncMock, MagicMock, patch

def test_send_notification(mocker):  # with pytest-mock
    mock_send = mocker.patch("myapp.email.send_email")
    notify_user(user_id=1)
    mock_send.assert_called_once_with(
        to="alice@example.com",
        subject="Welcome",
    )

async def test_async_fetch():
    with patch("myapp.client.httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get.return_value = AsyncMock(
            status_code=200,
            json=lambda: {"id": 1},
        )
        result = await fetch_user(1)
    assert result["id"] == 1
```

## Common Pitfalls

### Mutable Default Arguments

```python
# ❌ The list is created ONCE and shared across all calls
def append_to(item, lst=[]):
    lst.append(item)
    return lst

# ✅ Use None as sentinel
def append_to(item, lst=None):
    if lst is None:
        lst = []
    lst.append(item)
    return lst
```

### Late Binding in Closures

```python
# ❌ All lambdas capture the same `i` variable
funcs = [lambda: i for i in range(5)]
# funcs[0]() == 4  (not 0!)

# ✅ Bind at definition time with default argument
funcs = [lambda i=i: i for i in range(5)]
# funcs[0]() == 0
```

### The GIL and CPU-Bound Work

```python
# The GIL prevents true parallel execution of Python bytecode.
# For CPU-bound work, use multiprocessing or ProcessPoolExecutor.
from concurrent.futures import ProcessPoolExecutor

def cpu_bound(n: int) -> int:
    return sum(range(n))

with ProcessPoolExecutor() as pool:
    results = list(pool.map(cpu_bound, [10**7, 10**7, 10**7]))
```

### Circular Imports

```python
# ❌ module_a imports module_b, module_b imports module_a at module level
# ✅ Move the import inside the function that needs it
def get_thing():
    from myapp.other_module import Thing  # deferred import
    return Thing()

# ✅ Or restructure: extract shared types into a third module
```

## Related Skills
- backend-patterns
- django-patterns
- python-testing
