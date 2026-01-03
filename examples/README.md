# Effect TS Examples

Production-focused examples demonstrating how Effect solves real-world problems in high-throughput, high-performance services.

## Tier 1: Critical for Production Services

### 1. Error Handling & Recovery
**Problem**: Try-catch hell, instanceof checks, silent failures
- `npm run example:01-errors-traditional` - Traditional approach with nested try-catch
- `npm run example:01-errors-effect` - Effect approach with typed errors
- See: [notes.md](01-errors/notes.md)

### 2. Retry & Circuit Breaking  
**Problem**: Manual retry logic, no circuit breakers, cascade failures
- `npm run example:02-resilience-traditional` - Manual retry and circuit breaker
- `npm run example:02-resilience-effect` - Built-in policies and resilience
- See: [notes.md](02-resilience/notes.md)

### 3. Resource Management
**Problem**: Resource leaks, manual cleanup, complex finally blocks
- `npm run example:03-resources-traditional` - Manual cleanup with finally
- `npm run example:03-resources-effect` - Automatic cleanup with acquireRelease
- See: [notes.md](03-resources/notes.md)

### 4. Structured Concurrency
**Problem**: Orphaned operations, no cancellation propagation, race conditions
- `npm run example:04-concurrency-traditional` - Promise.all and manual coordination
- `npm run example:04-concurrency-effect` - Fiber-based structured concurrency
- See: [notes.md](04-concurrency/notes.md)

## Tier 2: Advanced Production Features

### 5. Dependency Injection & Context
**Problem**: Runtime DI containers, unclear dependencies, testing complexity
- `npm run example:05-dependency-injection` - Type-safe DI with Context and Layers

### 6. Schema Validation & Type Safety  
**Problem**: Runtime validation separate from types, data corruption
- `npm run example:06-schema-validation` - Branded types and schema composition

### 7. Fiber Management & Interruption
**Problem**: Manual cancellation, resource leaks, complex async coordination  
- `npm run example:07-fiber-management` - Fine-grained fiber control and cleanup

## Each Example Demonstrates

### Traditional Approach Shows:
- Manual error handling with try-catch
- Resource management complexity
- Lack of composability
- Hidden failure modes
- Maintenance burden

### Effect Approach Shows:
- Typed errors in function signatures
- Automatic resource cleanup
- Composable patterns
- No silent failures
- Production-ready reliability

## Running Examples

Each example can be run independently to see the differences in action:

```bash
# Compare error handling approaches
npm run example:01-errors-traditional
npm run example:01-errors-effect

# Compare resilience patterns  
npm run example:02-resilience-traditional
npm run example:02-resilience-effect

# Compare resource management
npm run example:03-resources-traditional
npm run example:03-resources-effect

# Compare concurrency patterns
npm run example:04-concurrency-traditional  
npm run example:04-concurrency-effect
```

## File Structure

Each example follows this pattern:
```
examples/XX-name/
├── traditional.ts  # Traditional TypeScript approach
├── effect.ts      # Effect-based approach  
└── notes.md       # Problems solved, production benefits
```

## Next Steps

After mastering these patterns, explore:
- Configuration management with layers
- HTTP clients with built-in resilience  
- Streaming data pipelines
- Custom resource pools
- Advanced testing patterns