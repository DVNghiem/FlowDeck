---
name: java-patterns
description: Modern Java 17+ patterns — records, sealed classes, Stream API, CompletableFuture, Spring Boot, JPA. Activate when writing or reviewing Java.
origin: FlowDeck
---

# Java Patterns Skill

Modern Java for production applications. Focuses on Java 17+ features and Spring Boot conventions.

## When to Activate

Activate when:
- Writing new Java services or libraries
- Reviewing Java code for correctness and modern idiom
- Designing API layers, service classes, or data access
- Troubleshooting Spring Boot configuration or JPA queries
- Setting up testing infrastructure

## Modern Java Features (17+)

### Records — Immutable Data Carriers

Records eliminate boilerplate for data classes. Use them for DTOs, value objects, and command/query objects.

```java
// Compiler generates constructor, getters, equals, hashCode, toString
public record Point(double x, double y) {}

// Custom constructor for validation
public record EmailAddress(String value) {
    public EmailAddress {
        Objects.requireNonNull(value);
        if (!value.contains("@")) {
            throw new IllegalArgumentException("invalid email: " + value);
        }
        value = value.toLowerCase();
    }
}

// Records can implement interfaces
public record PageRequest(int page, int size) implements Serializable {
    public PageRequest {
        if (page < 0) throw new IllegalArgumentException("page must be >= 0");
        if (size < 1 || size > 100) throw new IllegalArgumentException("size must be 1-100");
    }

    public int offset() { return page * size; }
}
```

### Sealed Classes — Closed Hierarchies

Use sealed classes to model a fixed set of variants. The compiler enforces exhaustive pattern matching.

```java
public sealed interface PaymentResult
    permits PaymentResult.Success, PaymentResult.Declined, PaymentResult.Error {

    record Success(String transactionId, BigDecimal amount) implements PaymentResult {}
    record Declined(String reason) implements PaymentResult {}
    record Error(Throwable cause) implements PaymentResult {}
}

// Pattern matching ensures all cases are handled
String message = switch (result) {
    case PaymentResult.Success s  -> "Charged " + s.amount();
    case PaymentResult.Declined d -> "Declined: " + d.reason();
    case PaymentResult.Error e    -> "Error: " + e.cause().getMessage();
};
```

### Pattern Matching instanceof

```java
// ❌ Old style — verbose cast
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.length());
}

// ✅ Pattern variable — binding in same expression
if (obj instanceof String s) {
    System.out.println(s.length());
}

// Combining with guards
if (obj instanceof String s && s.length() > 5) {
    System.out.println("long string: " + s);
}
```

### Text Blocks

```java
// ✅ Multiline strings without escaping
String json = """
        {
          "name": "Alice",
          "age": 30
        }
        """;

String query = """
        SELECT u.id, u.email
          FROM users u
         WHERE u.active = true
           AND u.created_at > :since
        """;
```

## Optional — Use at API Boundaries

Optional communicates "might be absent" in a return type. Never use it as a field type or parameter.

```java
// ✅ Return type — caller must handle absence
public Optional<User> findByEmail(String email) {
    return userRepository.findByEmail(email);
}

// ✅ Chained operations
String displayName = findByEmail(email)
    .map(User::displayName)
    .orElse("Anonymous");

// ✅ Throw if absent with meaningful message
User user = findByEmail(email)
    .orElseThrow(() -> new UserNotFoundException(email));

// ✅ Execute only if present
findByEmail(email).ifPresent(user -> auditLog.record(user.id()));

// ❌ Never null-check Optional itself
Optional<User> opt = findByEmail(email);
if (opt != null && opt.isPresent()) { ... }  // wrong

// ❌ Never use as a field type
class Service {
    private Optional<Cache> cache;  // wrong — use @Nullable or just null
}
```

## Stream API

### Core Operations

```java
List<String> activeEmails = users.stream()
    .filter(User::isActive)
    .sorted(Comparator.comparing(User::lastName))
    .map(User::email)
    .toList();  // Java 16+ unmodifiable list

// Collectors
Map<Department, List<Employee>> byDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::department));

Map<Boolean, List<User>> partitioned = users.stream()
    .collect(Collectors.partitioningBy(User::isAdmin));

// Reduce
BigDecimal total = cart.items().stream()
    .map(Item::price)
    .reduce(BigDecimal.ZERO, BigDecimal::add);
```

### flatMap — Flattening Nested Collections

```java
// One user has many orders, each order has many items
List<Item> allItems = users.stream()
    .flatMap(u -> u.orders().stream())
    .flatMap(o -> o.items().stream())
    .toList();
```

### Parallel Streams — When NOT to Use

```java
// ✅ Parallel for CPU-bound work on large, independent datasets
long count = IntStream.range(0, 10_000_000)
    .parallel()
    .filter(n -> isPrime(n))
    .count();

// ❌ Parallel with shared mutable state — data race
List<Integer> result = new ArrayList<>();
IntStream.range(0, 1000).parallel()
    .forEach(result::add);  // non-thread-safe!

// ❌ Parallel for I/O-bound work — blocks common ForkJoinPool
Stream.of(urls).parallel()
    .map(this::fetch)  // ties up ForkJoin threads on I/O
    .toList();

// Rule: parallel only when dataset is large, work is CPU-bound,
// and no shared mutable state exists. Benchmark first.
```

## CompletableFuture — Async Composition

```java
// Chain transformations
CompletableFuture<String> result = CompletableFuture
    .supplyAsync(() -> fetchUser(userId))        // background thread
    .thenApply(User::email)                      // same thread
    .thenApplyAsync(this::sendWelcome, executor); // different thread

// Compose dependent futures (flatMap equivalent)
CompletableFuture<Order> order = CompletableFuture
    .supplyAsync(() -> findUser(id))
    .thenCompose(user -> placeOrder(user, items));  // avoids nested futures

// Recover from failure
CompletableFuture<User> withFallback = fetchUser(id)
    .exceptionally(ex -> {
        log.warn("fetch failed, using guest", ex);
        return User.guest();
    });

// Wait for multiple independent futures
CompletableFuture<Void> all = CompletableFuture.allOf(
    sendEmail(user), updateCache(user), auditLog(user)
);
all.join();  // blocks — use only at the top of the call stack

// Timeout
CompletableFuture<User> withTimeout = fetchUser(id)
    .orTimeout(2, TimeUnit.SECONDS)
    .exceptionally(ex -> User.guest());
```

## Spring Boot Patterns

### Dependency Injection — Constructor Injection Only

```java
// ✅ Constructor injection — dependencies are explicit and final
@Service
public class OrderService {
    private final OrderRepository orders;
    private final PaymentGateway payments;
    private final EventPublisher events;

    public OrderService(
        OrderRepository orders,
        PaymentGateway payments,
        EventPublisher events
    ) {
        this.orders = orders;
        this.payments = payments;
        this.events = events;
    }
}

// ❌ Field injection — hides dependencies, breaks tests
@Service
public class OrderService {
    @Autowired private OrderRepository orders;  // bad
}
```

### @ConfigurationProperties — Typed Config

```java
@ConfigurationProperties(prefix = "payment")
public record PaymentConfig(
    String apiKey,
    URI baseUrl,
    Duration timeout,
    int maxRetries
) {}

// application.yml
// payment:
//   api-key: sk_live_...
//   base-url: https://api.stripe.com
//   timeout: 5s
//   max-retries: 3
```

### Layered Stereotypes

```java
@Repository   // data access — wraps DataAccessException
@Service      // business logic
@Component    // general-purpose bean
@RestController  // HTTP endpoints (combines @Controller + @ResponseBody)
```

## JPA and Hibernate

### N+1 Problem

```java
// ❌ N+1: one query for orders, then one query per order for items
List<Order> orders = orderRepo.findAll();
orders.forEach(o -> System.out.println(o.getItems().size()));

// ✅ Fetch join: single query
@Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.userId = :userId")
List<Order> findWithItems(@Param("userId") Long userId);

// ✅ Or use @EntityGraph for reuse
@EntityGraph(attributePaths = {"items", "items.product"})
List<Order> findByUserId(Long userId);
```

### Fetch Strategy

```java
// Default for @OneToMany is LAZY — keep it that way
@OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
private List<OrderItem> items;

// EAGER causes joins on every query, even when items aren't needed
// Only use EAGER for @ManyToOne / @OneToOne where the association is always needed
```

### Transaction Boundaries

```java
// @Transactional on service methods, not repository methods
@Service
public class TransferService {
    @Transactional
    public void transfer(Long fromId, Long toId, BigDecimal amount) {
        Account from = accounts.findById(fromId).orElseThrow();
        Account to   = accounts.findById(toId).orElseThrow();
        from.debit(amount);
        to.credit(amount);
        // both saves happen in the same transaction
    }
}
```

## Testing

### JUnit 5 with Mockito

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock OrderRepository orders;
    @Mock PaymentGateway payments;
    @InjectMocks OrderService service;

    @Test
    void placeOrder_chargesPaymentAndSavesOrder() {
        var user = aUser().build();
        var items = List.of(anItem().withPrice(BigDecimal.TEN).build());
        when(payments.charge(any(), any())).thenReturn(chargeSuccess());

        var result = service.placeOrder(user, items);

        assertThat(result.status()).isEqualTo(OrderStatus.CONFIRMED);
        verify(orders).save(argThat(o -> o.total().equals(BigDecimal.TEN)));
    }
}
```

### Spring Boot Test Slices

```java
// Unit test — no Spring context
@ExtendWith(MockitoExtension.class)
class UserServiceTest { ... }

// Web layer only — no full context
@WebMvcTest(UserController.class)
class UserControllerTest {
    @Autowired MockMvc mvc;
    @MockBean UserService service;

    @Test
    void getUser_returns200() throws Exception {
        when(service.findById(1L)).thenReturn(Optional.of(aUser().build()));
        mvc.perform(get("/users/1"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.email").value("alice@example.com"));
    }
}

// Full integration test
@SpringBootTest(webEnvironment = RANDOM_PORT)
@Transactional  // rolls back each test
class OrderIntegrationTest { ... }
```

## Build Configuration

### Maven

```xml
<properties>
    <java.version>21</java.version>
    <spring-boot.version>3.3.0</spring-boot.version>
</properties>

<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
        <release>${java.version}</release>
        <compilerArgs><arg>-parameters</arg></compilerArgs>
    </configuration>
</plugin>
```

### Gradle (Kotlin DSL)

```kotlin
java {
    toolchain { languageVersion = JavaLanguageVersion.of(21) }
}

tasks.withType<JavaCompile> {
    options.compilerArgs.add("-parameters")
}
```

## Common Pitfalls

### Checked Exceptions in New Code

```java
// ❌ Checked exceptions force callers to handle or declare them
public List<User> loadUsers() throws IOException, ParseException { ... }

// ✅ Wrap in unchecked and carry the cause
public List<User> loadUsers() {
    try {
        return parser.parse(Files.readString(path));
    } catch (IOException | ParseException e) {
        throw new UserLoadException("failed to load users from " + path, e);
    }
}
```

### String Concatenation in Loops

```java
// ❌ Creates a new String object every iteration — O(n²) allocations
String result = "";
for (String s : list) {
    result += s + ", ";
}

// ✅ StringBuilder is O(n)
var sb = new StringBuilder();
for (String s : list) {
    sb.append(s).append(", ");
}
String result = sb.toString();

// ✅ Or use String.join / Collectors.joining
String result = String.join(", ", list);
```

### Autoboxing Overhead

```java
// ❌ Unnecessary boxing in tight loops
Long sum = 0L;
for (long i = 0; i < 1_000_000; i++) {
    sum += i;  // unboxes sum, adds, boxes result each iteration
}

// ✅ Use primitives
long sum = 0L;
for (long i = 0; i < 1_000_000; i++) {
    sum += i;
}

// ✅ LongStream avoids boxing entirely
long sum = LongStream.range(0, 1_000_000).sum();
```
