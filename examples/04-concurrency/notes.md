# Structured Concurrency

## Problems with Traditional Approach

### 1. **Orphaned Operations**
```typescript
try {
  const results = await Promise.all([
    operation1(),
    operation2(),
    operation3()  // If this fails...
  ]);
} catch (error) {
  // operation1 and operation2 might still be running!
  // No way to cancel them
}
```
- Failed Promise.all doesn't cancel ongoing operations
- Operations continue consuming resources after failure
- Can cause memory leaks and unexpected behavior

### 2. **Manual Cancellation Complexity**
```typescript
const controller = new AbortController();

try {
  const results = await Promise.all([
    fetch('/api/1', { signal: controller.signal }),
    fetch('/api/2', { signal: controller.signal }),
    fetch('/api/3', { signal: controller.signal })
  ]);
} catch (error) {
  controller.abort(); // Manual cleanup
  throw error;
} finally {
  // Need to cleanup AbortController
}
```
- Manual signal propagation to all operations
- Easy to forget cancellation cleanup
- Complex coordination between operations

### 3. **Race Conditions in Coordination**
```typescript
let completed = 0;
const results = [];

promises.forEach(async (promise, index) => {
  try {
    results[index] = await promise;
    completed++;
    if (completed === promises.length) {
      // Race condition: might be called multiple times
      handleAllComplete(results);
    }
  } catch (error) {
    // What if some operations are still running?
    handleError(error);
  }
});
```

### 4. **No Structured Cleanup**
```typescript
async function processData() {
  const resource1 = await acquireResource1();
  const resource2 = await acquireResource2();
  
  try {
    // Start background operations
    const bg1 = backgroundTask1();
    const bg2 = backgroundTask2();
    
    const result = await mainProcessing();
    
    // What if mainProcessing fails?
    // bg1 and bg2 might still be running
    return result;
  } finally {
    // Manual cleanup - might miss background operations
    await resource1.close();
    await resource2.close();
  }
}
```

## Benefits of Effect Approach

### 1. **Automatic Cancellation Propagation**
```typescript
Effect.all([
  operation1,
  operation2,
  operation3  // If this fails...
])
// operation1 and operation2 are automatically cancelled!
```
- Fiber hierarchy ensures proper cleanup
- Failed operations automatically cancel siblings
- No manual signal propagation needed

### 2. **Structured Resource Cleanup**
```typescript
Effect.gen(function* () {
  const resource = yield* acquireResource();
  
  // Fork background operations
  const fiber1 = yield* Effect.fork(backgroundTask1());
  const fiber2 = yield* Effect.fork(backgroundTask2());
  
  const result = yield* mainProcessing(); // If this fails...
  
  return result;
}).pipe(
  Effect.ensuring(
    // ALL background fibers are automatically interrupted
    // Resource is automatically cleaned up
  )
);
```

### 3. **Composable Concurrency Patterns**
```typescript
// Parallel execution
Effect.all(operations, { concurrency: "unbounded" })

// Limited concurrency (backpressure)
Effect.all(operations, { concurrency: 3 })

// Sequential execution
Effect.all(operations, { concurrency: 1 })

// Racing with automatic cleanup
Effect.race([primary, fallback])
```

### 4. **Built-in Interruption Model**
```typescript
const interruptibleOperation = Effect.gen(function* () {
  yield* Effect.sleep(1000); // Automatically interruptible
  
  // Custom interruption handling
  return yield* longRunningTask().pipe(
    Effect.onInterrupt(() => cleanup())
  );
});
```

## Production Benefits

### Reliability
- **No Resource Leaks**: All operations properly cleaned up on failure
- **Predictable Cancellation**: Fiber hierarchy ensures structured cleanup
- **No Orphaned Operations**: Failed operations don't leave running background tasks

### Performance
- **Backpressure Control**: Limit concurrency to prevent resource exhaustion
- **Efficient Cancellation**: Immediate cleanup reduces resource usage
- **Memory Efficiency**: No accumulation of abandoned promises

### Observability
- **Fiber Tracking**: Built-in monitoring of concurrent operations
- **Structured Logging**: Clear hierarchy of operations and their relationships
- **Interruption Tracing**: Track why and how operations were cancelled

### Maintainability
- **Composable Patterns**: Reusable concurrency building blocks
- **Clear Error Boundaries**: Well-defined failure and recovery semantics
- **Testable Concurrency**: Deterministic testing of concurrent code

## Advanced Patterns

### 1. **Worker Pool Pattern**
```typescript
const processWithWorkerPool = (tasks: Task[], poolSize: number) =>
  Effect.gen(function* () {
    // Create a semaphore to limit concurrent workers
    const semaphore = yield* Effect.makeSemaphore(poolSize);
    
    // Process all tasks with controlled concurrency
    return yield* Effect.all(
      tasks.map(task =>
        semaphore.withPermit(processTask(task))
      )
    );
  });
```

### 2. **Producer-Consumer Pattern**
```typescript
const producerConsumer = Effect.gen(function* () {
  const queue = yield* Queue.bounded<Item>(100);
  
  // Fork producer
  const producer = yield* Effect.fork(
    Effect.forever(
      produceItem().pipe(
        Effect.flatMap(item => Queue.offer(queue, item))
      )
    )
  );
  
  // Fork consumer
  const consumer = yield* Effect.fork(
    Effect.forever(
      Queue.take(queue).pipe(
        Effect.flatMap(item => processItem(item))
      )
    )
  );
  
  // Both automatically cleaned up when scope exits
});
```

### 3. **Circuit Breaker with Backoff**
```typescript
const withCircuitBreaker = <A, E>(
  operation: Effect.Effect<A, E>,
  threshold: number,
  timeout: Duration
): Effect.Effect<A, E | CircuitBreakerError> =>
  Effect.gen(function* () {
    const state = yield* Ref.make({ failures: 0, lastFailure: 0 });
    
    return yield* state.get.pipe(
      Effect.flatMap(({ failures, lastFailure }) =>
        failures >= threshold && 
        Date.now() - lastFailure < timeout
          ? Effect.fail(new CircuitBreakerError())
          : operation.pipe(
              Effect.tapError(() => state.update(s => ({ 
                failures: s.failures + 1, 
                lastFailure: Date.now() 
              }))),
              Effect.tap(() => state.set({ failures: 0, lastFailure: 0 }))
            )
      )
    );
  });
```

### 4. **Timeout with Fallback Chain**
```typescript
const withTimeoutAndFallback = <A>(
  primary: Effect.Effect<A, any>,
  fallbacks: Effect.Effect<A, any>[],
  timeout: Duration
): Effect.Effect<A, never> => {
  const operations = [primary, ...fallbacks];
  
  return operations.reduce((acc, operation) =>
    acc.pipe(
      Effect.race(
        operation.pipe(Effect.timeout(timeout))
      ),
      Effect.catchAll(() => operation)
    )
  );
};
```

## Migration Strategy

1. **Identify Concurrency Hotspots**: Find Promise.all, Promise.race usage
2. **Add Proper Cancellation**: Replace AbortController with Effect interruption
3. **Structure Resource Cleanup**: Use Effect.ensuring and acquireRelease
4. **Control Concurrency**: Add backpressure with concurrency limits
5. **Add Observability**: Monitor fiber lifecycle and resource usage

## Common Concurrency Patterns

### Batch Processing
```typescript
const processBatch = <T, A>(
  items: T[],
  processor: (item: T) => Effect.Effect<A, any>,
  batchSize: number
) =>
  Effect.gen(function* () {
    const batches = chunk(items, batchSize);
    const results: A[][] = [];
    
    for (const batch of batches) {
      const batchResults = yield* Effect.all(
        batch.map(processor),
        { concurrency: "unbounded" }
      );
      results.push(batchResults);
    }
    
    return results.flat();
  });
```

### Rate Limited Processing
```typescript
const withRateLimit = <A, E>(
  operation: Effect.Effect<A, E>,
  requestsPerSecond: number
): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const semaphore = yield* Effect.makeSemaphore(requestsPerSecond);
    const delay = 1000 / requestsPerSecond;
    
    return yield* semaphore.withPermit(
      operation.pipe(
        Effect.delay(delay)
      )
    );
  });
```

### Fan-out/Fan-in Pattern
```typescript
const fanOutFanIn = <T, A>(
  input: T,
  processors: Array<(input: T) => Effect.Effect<A, any>>
): Effect.Effect<A[], never> =>
  Effect.all(
    processors.map(processor =>
      processor(input).pipe(
        Effect.either
      )
    )
  ).pipe(
    Effect.map(results =>
      results
        .filter(result => result._tag === 'Right')
        .map(result => result.right)
    )
  );
```