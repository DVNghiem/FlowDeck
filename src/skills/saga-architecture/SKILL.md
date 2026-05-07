---
name: saga-architecture
description: Saga coordination patterns for distributed transactions with compensating actions.
origin: FlowDeck
---

# saga-architecture

## When to Activate
When coordinating distributed operations across multiple services or data stores where ACID transactions are not available and compensating actions are needed to maintain eventual consistency.

## Steps
1. **Identify the saga participants** - Determine which services or components participate in the distributed operation.
2. **Define the saga choreography or orchestration** - Choose whether sagas will be choreographed (event-driven) or orchestrated (central coordinator).
3. **Define each step with corresponding compensation** - For every forward action, define what compensating action undoes it.
4. **Implement idempotent operations** - Ensure each step can be safely retried and compensation can be safely reapplied.
5. **Handle saga failures with compensation** - On failure, execute compensations in reverse order (for orchestrating sagas) or react to failure events (for choreographing sagas).
6. **Persist saga state** - Store saga state to survive process crashes and enable recovery.
7. **Add timeout and retry logic** - Detect stuck sagas and advance or compensate accordingly.

## Examples
```typescript
// Saga State
interface SagaState<T> {
  id: string
  currentStep: number
  data: T
  status: 'pending' | 'in_progress' | 'completed' | 'compensating' | 'failed'
}

// Orchestrating Saga - Central coordinator manages steps
class OrderProcessingSaga {
  private readonly steps: SagaStep[]

  constructor(
    private readonly sagaOrchestrator: SagaOrchestrator,
    private readonly inventoryService: InventoryService,
    private readonly paymentService: PaymentService,
    private readonly shippingService: ShippingService
  ) {
    this.steps = [
      {
        name: 'reserve_inventory',
        execute: (state) => this.inventoryService.reserve(state.orderId, state.items),
        compensate: (state) => this.inventoryService.release(state.orderId, state.items)
      },
      {
        name: 'process_payment',
        execute: (state) => this.paymentService.charge(state.orderId, state.total),
        compensate: (state) => this.paymentService.refund(state.orderId, state.total)
      },
      {
        name: 'initiate_shipping',
        execute: (state) => this.shippingService.createShipment(state.orderId),
        compensate: (state) => this.shippingService.cancelShipment(state.shipmentId)
      }
    ]
  }

  async execute(orderId: string): Promise<void> {
    const state: SagaState<OrderSagaData> = {
      id: generateId(),
      currentStep: 0,
      data: { orderId, items: [], total: 0 },
      status: 'in_progress'
    }

    await this.sagaOrchestrator.start(state, this.steps)
  }
}

// Choreography-based Saga - Events trigger reactions
class OrderCreatedHandler {
  constructor(private readonly eventBus: EventBus) {}

  async handle(event: OrderCreatedEvent): Promise<void> {
    // Step 1: Reserve inventory
    try {
      await this.inventoryService.reserve(event.orderId, event.items)
      this.eventBus.publish(new InventoryReservedEvent(event.orderId))
    } catch (error) {
      this.eventBus.publish(new InventoryReservationFailedEvent(event.orderId, error.message))
    }
  }
}

class InventoryReservedHandler {
  async handle(event: InventoryReservedEvent): Promise<void> {
    // Step 2: Process payment
    try {
      await this.paymentService.charge(event.orderId, event.total)
      this.eventBus.publish(new PaymentProcessedEvent(event.orderId))
    } catch (error) {
      // Compensate by releasing inventory
      this.eventBus.publish(new InventoryReleaseRequestedEvent(event.orderId))
    }
  }
}

// Idempotent Step Implementation
class PaymentService {
  async charge(orderId: string, amount: Money): Promise<TransactionId> {
    const existingTx = await this.transactionRepo.findByOrderId(orderId)
    if (existingTx) {
      return existingTx.id // Idempotent: return existing instead of charging again
    }

    const transaction = await this.paymentGateway.charge(amount)
    await this.transactionRepo.save({ orderId, transaction })
    return transaction.id
  }
}
```

## Related Skills
- clean-architecture
- hexagonal-architecture
- ddd-architecture
- backend-patterns
