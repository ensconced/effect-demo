# Resource Management

## Problems with Traditional Approach

### 1. **Nested Finally Blocks**
```typescript
try {
  const file = await openFile();
  try {
    const db = await connectDB();
    try {
      const http = await openHTTP();
      // work here
    } finally {
      await http.close(); // Might fail!
    }
  } finally {
    await db.close(); // Might fail!
  }
} finally {
  await file.close(); // Might fail!
}
```
- Deeply nested code that's hard to read and maintain
- Cleanup code scattered throughout the function
- Complex control flow with multiple exit points

### 2. **Cleanup Failures Can Mask Original Errors**
```typescript
try {
  await doWork();
} catch (originalError) {
  throw originalError;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    // What do we do here? Original error is lost!
    console.error('Cleanup failed:', cleanupError);
  }
}
```
- If cleanup fails, the original error might be lost
- No standard way to handle cleanup failures
- Error handling becomes exponentially complex

### 3. **Resource Leaks on Partial Failures**
```typescript
let file, db, http;
try {
  file = await openFile();
  db = await connectDB(); // Fails here
  http = await openHTTP(); // Never reached
} finally {
  // http is undefined, might not cleanup file and db properly
  await file?.close();
  await db?.close();
  await http?.close();
}
```
- Manual tracking of what resources were successfully acquired
- Easy to miss cleanup for partially acquired resources
- Memory leaks and connection exhaustion in production

### 4. **Cleanup Order Dependencies**
```typescript
// Resources must be cleaned up in reverse order of acquisition
// But this is not enforced and easy to get wrong
await http.close();  // Should be first
await db.close();    // Should be second  
await file.close();  // Should be last
```

## Benefits of Effect Approach

### 1. **Automatic Resource Management**
```typescript
Effect.acquireRelease(
  acquire,  // Resource acquisition
  release   // Guaranteed cleanup (even on failures)
)
```
- Cleanup is guaranteed to run, even if the operation fails
- No manual finally blocks needed
- Resources are always cleaned up in correct order (LIFO)

### 2. **Composable Resource Scopes**
```typescript
withFile(path)(file =>
  withDatabase(conn)(db =>
    withHTTP(url)(http =>
      // All resources available here
      // All will be cleaned up automatically in reverse order
    )
  )
)
```
- Resources compose naturally
- Clean, linear code flow
- Automatic cleanup order management

### 3. **Cleanup Errors Don't Mask Original Errors**
```typescript
const releaseFile = (file) => Effect.gen(function* () {
  // Even if this fails, original error is preserved
  yield* Effect.sync(() => console.error('Cleanup failed, but continuing'));
});
```
- Cleanup failures are logged but don't interfere with main error flow
- Original errors are always preserved
- Deterministic error handling

### 4. **Resource Pools and Advanced Patterns**
```typescript
const withPool = createResourcePool(
  acquire: Effect.Effect<Connection, Error>,
  release: (conn) => Effect.Effect<void, never>,
  poolSize: 10
);
```
- Built-in support for resource pooling
- Connection limiting and throttling
- Advanced resource management patterns

## Production Benefits

### Reliability
- **Zero Resource Leaks**: Impossible to forget cleanup with `acquireRelease`
- **Guaranteed Cleanup Order**: Resources cleaned up in reverse order of acquisition
- **Failure Isolation**: Cleanup failures don't affect business logic

### Performance
- **Connection Pooling**: Reuse expensive resources efficiently
- **Memory Management**: Predictable resource lifecycle
- **Backpressure**: Limit resource usage under load

### Observability
- **Resource Tracking**: Built-in metrics for resource acquisition/release
- **Leak Detection**: Easy to monitor resource usage patterns
- **Cleanup Monitoring**: Visibility into cleanup success/failure rates

### Maintainability
- **Linear Code Flow**: No nested finally blocks
- **Composable Patterns**: Resource management patterns can be composed
- **Type Safety**: Resource types are tracked through the computation

## Advanced Patterns

### 1. **Resource Transformation**
```typescript
const withFileContent = (path: string) =>
  withFile(path)(file => 
    Effect.gen(function* () {
      const content = yield* readFile(file);
      return content;
    })
  );
```

### 2. **Conditional Resource Acquisition**
```typescript
const withOptionalCache = (useCache: boolean) =>
  useCache 
    ? withCache(cache => operation(cache))
    : operation(null);
```

### 3. **Resource Scoping with Interruption**
```typescript
const processWithTimeout = (timeout: number) =>
  withFile(path)(file =>
    withDatabase(conn)(db =>
      Effect.timeout(
        processData(file, db),
        timeout
      )
    )
  );
// All resources automatically cleaned up on timeout
```

### 4. **Batch Resource Management**
```typescript
const withBatchConnections = (urls: string[]) =>
  Effect.all(
    urls.map(url => 
      Effect.acquireRelease(
        connectTo(url),
        disconnect
      )
    )
  );
```

## Migration Strategy

1. **Identify Resource Hotspots**: Find code with manual try/finally patterns
2. **Extract Resource Acquisition**: Create `acquire` and `release` functions
3. **Wrap with acquireRelease**: Replace try/finally with Effect.acquireRelease
4. **Compose Resources**: Combine multiple resource scopes
5. **Add Monitoring**: Track resource usage and cleanup metrics

## Common Resource Patterns

### Database Connections
```typescript
const withDbTransaction = <A, E>(
  operation: (tx: Transaction) => Effect.Effect<A, E>
): Effect.Effect<A, E | DbError> =>
  Effect.acquireRelease(
    beginTransaction(),
    (tx) => rollbackTransaction(tx).pipe(Effect.orElse(() => Effect.unit))
  ).pipe(
    Effect.flatMap(tx =>
      operation(tx).pipe(
        Effect.tap(() => commitTransaction(tx)),
        Effect.catchAll(error =>
          rollbackTransaction(tx).pipe(
            Effect.flatMap(() => Effect.fail(error))
          )
        )
      )
    )
  );
```

### File Operations
```typescript
const withTempFile = <A, E>(
  operation: (path: string) => Effect.Effect<A, E>
): Effect.Effect<A, E | FileError> =>
  Effect.acquireRelease(
    createTempFile(),
    (path) => deleteFile(path).pipe(Effect.orElse(() => Effect.unit))
  ).pipe(Effect.flatMap(operation));
```

### Network Resources
```typescript
const withWebSocket = <A, E>(
  url: string,
  operation: (ws: WebSocket) => Effect.Effect<A, E>
): Effect.Effect<A, E | NetworkError> =>
  Effect.acquireRelease(
    connectWebSocket(url),
    (ws) => closeWebSocket(ws).pipe(Effect.orElse(() => Effect.unit))
  ).pipe(Effect.flatMap(operation));
```