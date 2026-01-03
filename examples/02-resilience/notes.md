# Retry & Circuit Breaking

## Problems with Traditional Approach

### 1. **Manual Retry Logic Duplication**
```typescript
// This pattern gets repeated everywhere:
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    return await operation();
  } catch (error) {
    if (attempt === maxAttempts) throw error;
    await sleep(baseDelay * Math.pow(2, attempt - 1));
  }
}
```
- Same retry logic copy-pasted across services
- Hard to maintain consistent retry behavior
- No standardization across the codebase

### 2. **Complex Circuit Breaker State Management**
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  // 40+ lines of manual state management
}
```
- Manual state tracking prone to bugs
- Hard to test all state transitions
- Memory leaks if not cleaned up properly

### 3. **No Built-in Jitter or Advanced Policies**
- Simple exponential backoff causes thundering herd
- No jitter to spread out retries
- Hard to implement complex policies (only retry specific errors, etc.)

### 4. **Timeout Handling is Manual**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);
try {
  // operation
} finally {
  clearTimeout(timeoutId); // Easy to forget
}
```
- AbortController setup is boilerplate
- Memory leaks if cleanup is missed
- Hard to compose timeouts with retries

## Benefits of Effect Approach

### 1. **Built-in Retry Policies**
```typescript
const retryPolicy = pipe(
  Schedule.exponential(500),     // Exponential backoff
  Schedule.compose(Schedule.recurs(3)), // Max retries
  Schedule.compose(Schedule.jittered)   // Add jitter
);

Effect.retry(effect, retryPolicy);
```
- Pre-built, tested retry policies
- Composable and reusable
- Built-in jitter prevents thundering herd

### 2. **Automatic Timeout Handling**
```typescript
Effect.timeout(effect, 5000) // Automatic cleanup
```
- No manual AbortController setup
- Automatic resource cleanup
- Composable with other operations

### 3. **Policy Composition**
```typescript
const advancedPolicy = pipe(
  Schedule.exponential(100),
  Schedule.compose(Schedule.recurs(3)),
  Schedule.whileInput(isRetryableError), // Only retry specific errors
  Schedule.andThen(Schedule.spaced(5000)) // Then switch to fixed intervals
);
```
- Combine multiple policies
- Conditional retries based on error type
- Complex policies with simple composition

### 4. **Built-in Circuit Breaking Patterns**
```typescript
// Effect provides building blocks for circuit breakers:
// - Ref for state management
// - Interruption for fast failure
// - Scheduling for timeout windows
```
- No manual state management
- Automatic cleanup
- Composable with other patterns

## Production Benefits

### Reliability
- **Consistent Behavior**: Same retry policies across all services
- **Tested Policies**: Built-in policies are battle-tested
- **No Resource Leaks**: Automatic cleanup of timeouts and controllers

### Performance
- **Jittered Backoff**: Prevents thundering herd problems
- **Intelligent Retries**: Only retry errors that make sense
- **Efficient Timeouts**: No polling or manual cleanup

### Observability
- **Built-in Metrics**: Retry attempts, circuit breaker state
- **Structured Logging**: Rich error information
- **Tracing**: Automatic spans for retry operations

### Maintainability
- **Policy Reuse**: Define once, use everywhere
- **Easy Testing**: Mock schedules and timeouts
- **Configuration**: Change policies without code changes

## Advanced Patterns

### 1. **Conditional Retries**
```typescript
Schedule.whileInput((error: Error) => 
  error.status >= 500 && error.status < 600
); // Only retry server errors
```

### 2. **Fallback Strategies**
```typescript
primary.pipe(
  Effect.orElse(() => secondary),
  Effect.orElse(() => cached)
);
```

### 3. **Rate Limiting Integration**
```typescript
pipe(
  apiCall,
  Effect.retry(
    Schedule.intersect(
      standardRetry,
      Schedule.spaced(1000) // Rate limit: max 1 call per second
    )
  )
);
```

### 4. **Deadline Propagation**
```typescript
Effect.timeout(
  pipe(
    step1,
    Effect.flatMap(() => step2),
    Effect.flatMap(() => step3)
  ),
  totalTimeout // Applies to entire chain
);
```

## Migration Strategy

1. **Extract Retry Logic**: Move existing retry functions to Effect schedules
2. **Replace Circuit Breakers**: Use Effect's Ref-based implementations
3. **Add Timeout Boundaries**: Wrap existing Promises with Effect.timeout
4. **Standardize Policies**: Create shared retry policy configurations
5. **Add Observability**: Integrate metrics and logging into policies

## Configuration Example

```typescript
// config/resilience.ts
export const ResiliencePolicies = {
  database: pipe(
    Schedule.exponential(100),
    Schedule.compose(Schedule.recurs(3))
  ),
  
  externalApi: pipe(
    Schedule.exponential(500),
    Schedule.compose(Schedule.recurs(5)),
    Schedule.compose(Schedule.jittered)
  ),
  
  criticalPath: Schedule.once // Fail fast
};
```