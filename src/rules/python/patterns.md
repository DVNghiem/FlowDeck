# Python Patterns

Python conventions for FlowDeck projects.

## Module Organization

- Single `.py` file for small, cohesive utilities.
- Convert to a package (`dir/__init__.py`) when the file grows past ~300 lines or needs sub-modules.
- Keep `__init__.py` thin — expose only the public API; don't execute side effects.
- Declare `__all__` in every module that has a meaningful public surface.

```python
# mypackage/__init__.py
from .core import Engine
from .config import Config

__all__ = ["Engine", "Config"]
```

## Naming Conventions

| Construct | Style | Example |
|---|---|---|
| Variable / function / method | `snake_case` | `get_user`, `is_active` |
| Class | `PascalCase` | `UserService`, `HttpClient` |
| Module / package | `snake_case` | `user_service.py` |
| Constant (module-level) | `SCREAMING_SNAKE_CASE` | `MAX_RETRIES = 3` |
| "Private" member | `_leading_underscore` | `_internal_cache` |
| Name-mangled member | `__double_leading` | `__secret` (avoid in most cases) |

## Never Use Mutable Default Arguments

```python
# ❌ The list is shared across all calls
def add_item(item, lst=[]):
    lst.append(item)
    return lst

# ✅ Use None and guard inside the function
def add_item(item, lst=None):
    if lst is None:
        lst = []
    lst.append(item)
    return lst
```

## Always Use f-strings

```python
# ❌ %-formatting — old, hard to read
msg = "Hello, %s! You have %d messages." % (name, count)

# ❌ .format() — verbose
msg = "Hello, {}! You have {} messages.".format(name, count)

# ✅ f-string — concise, readable, evaluated at runtime
msg = f"Hello, {name}! You have {count} messages."

# f-strings support expressions and format specs
price = f"${amount:.2f}"
debug = f"{obj!r}"
```

## Use pathlib.Path, Not os.path

```python
# ❌ os.path — verbose and easy to misuse
import os
full_path = os.path.join(base_dir, "data", "users.csv")
if os.path.exists(full_path):
    with open(full_path) as f: ...

# ✅ pathlib.Path — object-oriented, composable
from pathlib import Path
full_path = Path(base_dir) / "data" / "users.csv"
if full_path.exists():
    content = full_path.read_text()
```

## Prefer Explicit Over Implicit

```python
# ❌ Wildcard import — pollutes namespace, hides dependencies
from mymodule import *

# ✅ Explicit import — clear origin of each name
from mymodule import SpecificClass, helper_function
```

## Type Annotations on All Public Functions

Every public function and method must have type annotations on all parameters and the return type.

```python
# ❌ No annotations
def find_users(active, limit):
    ...

# ✅ Fully annotated
def find_users(active: bool, limit: int = 100) -> list[User]:
    ...
```

Private/internal functions (prefixed with `_`) should be annotated where the types are non-obvious.

## Testing with pytest

- All tests use `pytest`. Do not use `unittest` for new code (legacy code may remain).
- Test files: `tests/test_<module>.py` or co-located `<module>_test.py`.
- Use fixtures for setup/teardown — not `setUp`/`tearDown` class methods.
- Use `@pytest.mark.parametrize` for functions that need more than two input cases.
- Tests must be deterministic — no time-dependent, order-dependent, or network-dependent tests without explicit mocking.

```python
# ✅ parametrize instead of copy-pasted test functions
@pytest.mark.parametrize("value,expected", [
    (0, False),
    (1, True),
    (-1, False),
])
def test_is_positive(value: int, expected: bool) -> None:
    assert is_positive(value) == expected
```

## Virtual Environments — Never Global pip Install

```bash
# ✅ Create a venv and install there
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# ✅ uv (preferred — much faster)
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"

# ❌ Never install packages globally for a project
pip install requests   # installs into system Python
```

All project dependencies must live in `pyproject.toml`. Development tools (pytest, mypy, ruff) go in `[project.optional-dependencies]` under `dev`.
