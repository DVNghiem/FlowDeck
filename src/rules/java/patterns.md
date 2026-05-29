---
description: Java conventions — Java 17+ features, Spring Boot patterns, checked exceptions, testing with JUnit 5
always_on: false
stages: [execute, fix-bug, verify]
languages: [java]
---

# Java Patterns

Java conventions for FlowDeck projects. Targets Java 17+.

## Constructor Injection Only

Use constructor injection for all Spring-managed beans. Never use field injection.

```java
// ❌ Field injection — hides dependencies, cannot be tested without Spring
@Service
public class ReportService {
    @Autowired private UserRepository users;
    @Autowired private EmailService email;
}

// ✅ Constructor injection — explicit, testable, fields can be final
@Service
public class ReportService {
    private final UserRepository users;
    private final EmailService email;

    public ReportService(UserRepository users, EmailService email) {
        this.users = users;
        this.email = email;
    }
}
```

## Never Return null from Public Methods

Public methods must not return `null`. Use `Optional<T>` for absence, throw for impossible states.

```java
// ❌ null return — callers can't tell if null is expected or a bug
public User findUser(long id) {
    return repository.findById(id);  // returns null when not found
}

// ✅ Optional signals intentional absence
public Optional<User> findUser(long id) {
    return repository.findById(id);
}

// ✅ Throw when absence is a contract violation
public User getUser(long id) {
    return repository.findById(id)
        .orElseThrow(() -> new UserNotFoundException(id));
}
```

## All DTOs Should Be Records

Use Java records (Java 16+) for data transfer objects, API request/response bodies, and value objects.

```java
// ❌ Mutable class with boilerplate
public class CreateUserRequest {
    private String email;
    private String name;
    // getters, setters, equals, hashCode, toString...
}

// ✅ Record — immutable, compact, compiler-generated methods
public record CreateUserRequest(String email, String name) {}

// Records can include validation
public record PageRequest(int page, int size) {
    public PageRequest {
        if (page < 0) throw new IllegalArgumentException("page must be >= 0");
        if (size < 1 || size > 100) throw new IllegalArgumentException("size must be 1–100");
    }
}
```

## Use var for Obvious Local Variable Types

Use `var` when the right-hand side makes the type immediately apparent. Do not use `var` when it obscures the type.

```java
// ✅ Type is obvious from the right-hand side
var users = new ArrayList<User>();
var config = PaymentConfig.load();
var client = new HttpClient();

// ❌ Type is not obvious — write it out
var result = process(data);   // what type is result?
var x = getValue();           // unclear
```

## Avoid Checked Exceptions in New Code

New code must not declare checked exceptions. Wrap checked exceptions from third-party libraries in unchecked exceptions and preserve the cause.

```java
// ❌ Checked exception propagates through every caller
public List<User> loadUsers() throws IOException { ... }

// ✅ Unchecked exception at the boundary
public List<User> loadUsers() {
    try {
        return parser.parse(Files.readString(configPath));
    } catch (IOException e) {
        throw new UserLoadException("failed to read users from " + configPath, e);
    }
}
```

## All Database Queries Must Have Explicit Transaction Boundaries

Annotate the service method with `@Transactional`, not the repository method. The service defines the unit of work.

```java
// ❌ Transaction on repository — too granular, two separate transactions
public void transfer(long fromId, long toId, BigDecimal amount) {
    accountRepo.debit(fromId, amount);   // tx 1
    accountRepo.credit(toId, amount);    // tx 2 — debit committed even if credit fails
}

// ✅ Transaction on service method — single atomic unit
@Transactional
public void transfer(long fromId, long toId, BigDecimal amount) {
    accountRepo.debit(fromId, amount);
    accountRepo.credit(toId, amount);    // rolls back both on failure
}
```

## Never Use String.format() in Hot Paths

Avoid `String.format()` in loops or frequently-called methods. Use `StringBuilder` or text blocks.

```java
// ❌ String.format in a loop — allocates a new formatter each iteration
for (var item : items) {
    log.debug(String.format("Processing item id=%d name=%s", item.id(), item.name()));
}

// ✅ SLF4J lazy substitution — string only built if DEBUG is enabled
for (var item : items) {
    log.debug("Processing item id={} name={}", item.id(), item.name());
}

// ✅ StringBuilder for building large strings
var sb = new StringBuilder();
for (var item : items) {
    sb.append(item.name()).append(", ");
}
```

## Testing Strategy

- **Unit tests**: pure JUnit 5 + Mockito, annotated with `@ExtendWith(MockitoExtension.class)`. No Spring context.
- **Web slice tests**: `@WebMvcTest` for controller layer only.
- **Integration tests**: `@SpringBootTest` for end-to-end paths. Use `@Transactional` to roll back data after each test.
- Do not use `@SpringBootTest` for pure service or repository unit tests — it loads the full context unnecessarily.

```java
// Unit test — no Spring
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock OrderRepository orders;
    @InjectMocks OrderService service;
    ...
}

// Integration test
@SpringBootTest
@Transactional
class OrderFlowIntegrationTest { ... }
```

## Lombok Usage

Lombok is permitted only for the following annotations:

- `@Builder` — for complex object construction
- `@Value` — for immutable classes (prefer records for new code)
- `@Slf4j` — for logger injection

Do **not** use `@Data` on JPA entities. It generates `equals`/`hashCode` based on all fields, which causes problems with proxies and lazy loading. Implement them manually using only the primary key.

```java
// ❌ @Data on entity
@Data
@Entity
public class Order { ... }

// ✅ @Slf4j and manual equals/hashCode on entity
@Slf4j
@Entity
public class Order {
    @Id private Long id;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Order other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() { return getClass().hashCode(); }
}
```
