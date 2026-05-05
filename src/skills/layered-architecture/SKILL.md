# layered-architecture

## When to Activate
When building traditional monolithic or client-server applications where clear vertical separation of concerns improves maintainability (e.g., MVC applications, REST APIs, data-driven apps).

## Steps
1. **Identify natural layers** - Determine the distinct vertical tiers based on responsibility (e.g., presentation, business logic, data access).
2. **Define layer responsibilities** - Establish clear contracts for what each layer can and cannot depend on.
3. **Implement top-down dependencies** - Higher layers (presentation) depend on lower layers (data), but never vice versa.
4. **Create layer interfaces** - Use interfaces or abstract classes to define how adjacent layers communicate.
5. **Enforce layer access rules** - Use module visibility, package private, or architectural linting tools to prevent cross-layer pollution.
6. **Keep thin layers** - Avoid bloating any single layer; if the business logic layer grows large, consider extracting domain objects.

## Examples
```typescript
// Presentation Layer - Controllers/Handlers
class OrderController {
  constructor(private readonly orderService: OrderService) {}

  async createOrder(req: Request, res: Response): Promise<void> {
    const order = await this.orderService.createOrder(req.body)
    res.status(201).json(order)
  }
}

// Business Logic Layer - Services
class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly paymentGateway: PaymentGateway
  ) {}

  async createOrder(data: CreateOrderDto): Promise<Order> {
    const order = new Order(data.items)

    if (data.paymentMethod === 'prepaid') {
      await this.paymentGateway.charge(order.total, data.paymentToken)
    }

    return this.orderRepository.save(order)
  }
}

// Data Access Layer - Repositories
interface OrderRepository {
  save(order: Order): Promise<void>
  findById(id: string): Promise<Order | null>
  findByCustomer(customerId: string): Promise<Order[]>
}

class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly db: Database) {}

  async save(order: Order): Promise<void> {
    await this.db.query('INSERT INTO orders (...) VALUES (...)', order.toDbFormat())
  }
}
```

## Related Skills
- clean-architecture
- hexagonal-architecture
- ddd-architecture
- backend-patterns
