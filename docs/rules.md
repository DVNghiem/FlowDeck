# FlowDeck Rules

Rules are coding standards used by FlowDeck agents for style, testing, security, and language-specific guidance.

## How Rules Load

FlowDeck loads all markdown files under `src/rules/` automatically through plugin startup. You do not need to manually copy or symlink rule files.

## Precedence

When guidance conflicts, precedence is:

1. `AGENTS.md` and `CLAUDE.md` in the repository
2. FlowDeck plugin rules in `src/rules/**`
3. Runtime policy rules in `.codebase/POLICIES.json`

This keeps repository-specific conventions authoritative and lets policy learning add guardrails without overriding project intent.

---

## Rules Structure

```
rules/
  common/
    coding-style.md         ← Universal principles: names, simplicity, comments
    testing.md              ← Coverage, naming, isolation, AAA pattern
    security.md             ← Prohibited patterns, credentials, input validation
    git-workflow.md         ← Branch strategy, Conventional Commits, PR standards
    agent-orchestration.md  ← When to use which agent, parallel execution gates
  python/
    patterns.md             ← Type hints, asyncio, pytest, pitfalls
  golang/
    patterns.md             ← Error handling, goroutines, interfaces, testing
  java/
    patterns.md             ← Modern Java 17+, Spring Boot, JPA, testing
  rust/
    patterns.md             ← Ownership, traits, Tokio async, error handling
  typescript/
    patterns.md             ← Strict mode, interfaces, async patterns, naming
```

---

## Common Rules Reference

### coding-style.md

Applies to all languages and frameworks.

**Key rules:**

- **Names that explain intent.** Variables, functions, and types should read like prose. `getUserById` is acceptable; `getU` is not. If you need a comment to explain what a name means, rename it instead.
- **Functions under 20 lines.** If a function exceeds 20 lines, it is doing too much. Extract sub-functions with descriptive names. Exceptions require an inline comment explaining why the complexity is necessary.
- **Comments explain why, not what.** The code already shows what is happening. Comments are for decisions that are not obvious from reading the code: trade-offs, workarounds, business rules that contradict the obvious approach.
- **No dead code in pull requests.** Commented-out code, unused variables, and unreachable branches must be removed before a PR is opened. Use version control to recover deleted code if needed.
- **Match existing style exactly.** If the file uses tabs, use tabs. If the module uses a particular naming convention, follow it — even if your preference differs. Consistency across a file matters more than personal style.

---

### testing.md

Applies to all automated test suites.

**Key rules:**

- **TDD first.** Write the failing test before writing the implementation. The test defines the contract; the implementation satisfies it. This produces smaller, more focused implementations.
- **Coverage ≥ 80% for new code.** All new code introduced in a PR must achieve at least 80% line coverage. This is a floor, not a target — critical paths should aim for 100%.
- **Test names describe the scenario.** Test names follow the pattern `<subject>_<condition>_<expected outcome>`. For example: `createUser_withDuplicateEmail_returnsConflictError`. The name should be readable without opening the test body.
- **No implementation details in tests.** Tests assert on outputs and observable behavior — not on private methods, internal state, or call counts that are not part of the contract. Testing internals makes refactoring painful.
- **Integration tests at every external boundary.** Any code that touches a database, external API, file system, or message queue must have at least one integration test. Unit tests alone are insufficient at these boundaries.

---

### security.md

Applies to all code that handles user input, credentials, or external communication.

**Key rules:**

- **Never store secrets in code.** No API keys, passwords, connection strings, or tokens in source files — including comments. Use environment variables or a secrets manager. The `.planning/config.json` stores settings, not credentials.
- **Validate all inputs.** Every value that originates outside the current process (HTTP request, CLI argument, file content, environment variable) must be validated for type, length, format, and range before use.
- **Use parameterized queries.** String-concatenated SQL is prohibited regardless of context. Use your framework's parameterized query or ORM interface for every database interaction.
- **HTTPS only for external communication.** No HTTP calls to external services in production code. Certificate verification must not be disabled.
- **Log security events.** Authentication successes, authentication failures, authorization denials, and privilege escalations must be logged with enough context to reconstruct the event. Do not log passwords, tokens, or PII.
- **No `eval()` or dynamic code execution.** `eval`, `exec`, `Function()`, and their equivalents are prohibited. If a use case seems to require them, escalate to `@architect` for a safer alternative.

---

### git-workflow.md

Applies to all commits, branches, and pull requests in FlowDeck-managed projects.

**Key rules:**

- **Conventional Commits format.** All commit messages must follow the format `<type>(<scope>): <subject>`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`. Example: `feat(auth): add JWT refresh token rotation`.
- **Branch naming: `<type>/issue-<number>-<short-description>`.** Example: `feat/issue-123-user-preferences`. The issue number creates a traceable link; the description makes the branch list scannable.
- **Squash before merge.** Work-in-progress commits (`wip: trying approach`, `fix typo`) must be squashed before a PR is merged. The squashed commit message must follow Conventional Commits.
- **Every PR requires a description.** The PR body must include: what changed, why it changed, how to test it, and any migration steps. A blank PR description blocks review.
- **No force-push to shared branches.** `main`, `develop`, and release branches are protected. Force-push is only permitted on personal feature branches before a PR is opened.

---

### agent-orchestration.md

Governs how FlowDeck agents are selected and coordinated.

**Key rules:**

- **Use `@orchestrator` for multi-step work.** Any task that spans more than one agent or involves sequencing should be delegated to `@orchestrator`. Do not manually chain agents — let `@orchestrator` manage handoffs and error recovery.
- **Run `@task-splitter` before `/fd-new-feature` on large scope.** If a feature description spans more than a few hours of work, invoke `@task-splitter` first to break it into independent sub-features. Attempting to implement large scope in one `/fd-new-feature` call produces lower-quality output.
- **`@reviewer` is mandatory before merge.** Every code-producing command (`/fd-new-feature`, `/fd-fix-bug`) must be followed by at least one `@reviewer` pass. This is enforced when guard mode is enabled in `.planning/config.json`.
- **`@security-auditor` is mandatory for auth, payment, and PII code.** Any change to authentication flows, payment processing, or code that stores or transmits personally identifiable information must be audited by `@security-auditor` before merge — regardless of the change size.
- **Wave gates are not optional.** In parallel execution, Wave 3 (`@coder` + `@tester`) must not begin until Wave 2 (`@architect`) has produced its output. Starting implementation before design is complete produces rework.

---

## Language Rules Reference

### Python — `rules/python/patterns.md`

**Key rules:**

1. **Type annotations on all public functions.**

   ```python
   # Required
   def get_user(user_id: int) -> User | None:
       ...

   # Not allowed
   def get_user(user_id):
       ...
   ```

2. **Never use mutable default arguments.**

   ```python
   # Required
   def append_item(item: str, items: list[str] | None = None) -> list[str]:
       items = items or []
       items.append(item)
       return items

   # Not allowed — items persists across calls
   def append_item(item: str, items: list[str] = []) -> list[str]:
       items.append(item)
       return items
   ```

3. **Use f-strings for string formatting.**

   ```python
   # Required
   message = f"User {user.name} logged in at {timestamp}"

   # Not allowed
   message = "User %s logged in at %s" % (user.name, timestamp)
   message = "User {} logged in at {}".format(user.name, timestamp)
   ```

4. **Use `pathlib.Path`, not `os.path`.**

   ```python
   # Required
   from pathlib import Path
   config_path = Path("~/.config/opencode").expanduser() / "settings.json"

   # Not allowed
   import os
   config_path = os.path.join(os.path.expanduser("~"), ".config", "opencode", "settings.json")
   ```

5. **Use pytest for all tests.** No `unittest.TestCase` in new code. Use `pytest.fixture` for setup, `pytest.mark.parametrize` for table-driven tests.

   ```python
   import pytest

   @pytest.mark.parametrize("email,expected", [
       ("valid@example.com", True),
       ("not-an-email", False),
       ("", False),
   ])
   def test_validate_email(email: str, expected: bool) -> None:
       assert validate_email(email) == expected
   ```

---

### Go — `rules/golang/patterns.md`

**Key rules:**

1. **Always handle errors explicitly. Never discard with `_`.**

   ```go
   // Required
   result, err := db.Query(ctx, query)
   if err != nil {
       return fmt.Errorf("querying users: %w", err)
   }

   // Not allowed
   result, _ := db.Query(ctx, query)
   ```

2. **Error strings: lowercase, no trailing punctuation.**

   ```go
   // Required
   return fmt.Errorf("user not found: id %d", userID)

   // Not allowed
   return fmt.Errorf("User not found: id %d.", userID)
   ```

3. **Pass `context.Context` as the first argument for any cancellable operation.**

   ```go
   // Required
   func FetchUser(ctx context.Context, id int) (*User, error) {
       return db.QueryRowContext(ctx, "SELECT * FROM users WHERE id = $1", id)
   }
   ```

4. **Table-driven tests for functions with multiple cases.**

   ```go
   func TestValidateEmail(t *testing.T) {
       cases := []struct {
           name     string
           input    string
           wantOK   bool
       }{
           {"valid", "user@example.com", true},
           {"missing at", "userexample.com", false},
           {"empty", "", false},
       }
       for _, tc := range cases {
           t.Run(tc.name, func(t *testing.T) {
               got := validateEmail(tc.input)
               if got != tc.wantOK {
                   t.Errorf("validateEmail(%q) = %v, want %v", tc.input, got, tc.wantOK)
               }
           })
       }
   }
   ```

5. **No `panic` for expected error conditions.** Use `panic` only for programmer errors (nil pointer in invariant-violation scenarios). All expected failures return an `error`.

---

### Java — `rules/java/patterns.md`

Targets Java 17+ with Spring Boot.

**Key rules:**

1. **Constructor injection only. Never `@Autowired` on a field.**

   ```java
   // Required
   @Service
   public class UserService {
       private final UserRepository userRepository;

       public UserService(UserRepository userRepository) {
           this.userRepository = userRepository;
       }
   }

   // Not allowed
   @Service
   public class UserService {
       @Autowired
       private UserRepository userRepository;
   }
   ```

2. **Never return `null` from a public method.** Return `Optional<T>` for values that may be absent, or throw a typed exception.

   ```java
   // Required
   public Optional<User> findById(long id) {
       return userRepository.findById(id);
   }
   ```

3. **All DTOs are Java records.**

   ```java
   // Required
   public record CreateUserRequest(String email, String displayName) {}

   // Not allowed
   public class CreateUserRequest {
       private String email;
       // getters, setters, constructors...
   }
   ```

4. **No checked exceptions in new code.** Wrap checked exceptions in unchecked runtime exceptions at integration boundaries.

   ```java
   // Required
   try {
       Files.readString(path);
   } catch (IOException e) {
       throw new StorageException("Failed to read config file: " + path, e);
   }
   ```

5. **`@Transactional` on the service layer only.** Never place `@Transactional` on repository methods or controller methods.

---

### Rust — `rules/rust/patterns.md`

**Key rules:**

1. **Return `Result<T, E>` from library code. Never `panic`.**

   ```rust
   // Required
   pub fn parse_config(path: &Path) -> Result<Config, ConfigError> {
       let content = fs::read_to_string(path)
           .map_err(|e| ConfigError::Io { path: path.to_owned(), source: e })?;
       toml::from_str(&content).map_err(ConfigError::Parse)
   }
   ```

2. **Use `expect()` with a descriptive message. Never bare `unwrap()`.**

   ```rust
   // Required
   let port: u16 = env::var("PORT")
       .expect("PORT environment variable must be set")
       .parse()
       .expect("PORT must be a valid u16");

   // Not allowed
   let port: u16 = env::var("PORT").unwrap().parse().unwrap();
   ```

3. **All public items have rustdoc comments.**

   ```rust
   /// Fetches a user by their unique identifier.
   ///
   /// Returns `None` if no user with the given `id` exists.
   pub async fn get_user(id: UserId) -> Option<User> {
       ...
   }
   ```

4. **`clippy` must pass with no warnings before review.** Run `cargo clippy -- -D warnings` as part of the PR process. Suppress specific lints only with a comment explaining why.

5. **`#[cfg(test)]` for unit tests; `tests/` for integration tests.** Unit tests live in the same file as the code they test. Integration tests that require external services live under `tests/`.

---

### TypeScript — `rules/typescript/patterns.md`

**Key rules:**

1. **`strict: true` is always enabled.** No exceptions. If `strict` is disabled in a `tsconfig.json`, that is a bug.

   ```json
   {
     "compilerOptions": {
       "strict": true
     }
   }
   ```

2. **Prefer `interface` over `type` aliases for object shapes.**

   ```typescript
   // Required
   interface UserProfile {
     id: string;
     email: string;
     displayName: string;
   }

   // Acceptable for unions and intersections only
   type UserOrAdmin = User | Admin;
   ```

3. **`async`/`await` over `.then()` chains.**

   ```typescript
   // Required
   async function fetchUser(id: string): Promise<User> {
     const response = await fetch(`/api/users/${id}`);
     if (!response.ok) throw new ApiError(response.status);
     return response.json() as Promise<User>;
   }

   // Not allowed
   function fetchUser(id: string): Promise<User> {
     return fetch(`/api/users/${id}`)
       .then(response => { if (!response.ok) throw new ApiError(response.status); return response; })
       .then(response => response.json());
   }
   ```

4. **Use `unknown` over `any`.** If you do not know the type, use `unknown` and narrow it before use. `any` disables type checking and is banned except in test utilities.

   ```typescript
   // Required
   function parseResponse(data: unknown): User {
     if (!isUser(data)) throw new TypeError("Invalid user shape");
     return data;
   }
   ```

5. **Named exports preferred over default exports.** Named exports are tree-shakeable and produce better refactoring tooling support.

   ```typescript
   // Required
   export function createUser(email: string): User { ... }
   export interface UserRepository { ... }

   // Avoid
   export default function createUser(email: string): User { ... }
   ```

---

← [Back to Index](index.md)
