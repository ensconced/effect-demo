/**
 * Effect-based Retry & Circuit Breaking - External API Client
 * 
 * Benefits demonstrated:
 * - Built-in retry policies with exponential backoff
 * - Automatic timeout handling
 * - Composable resilience patterns
 * - Easy to test and configure
 * - No manual state management
 * - Policy reusability across services
 */

import { Effect, Schedule, pipe } from "effect";

interface ApiResponse {
  data: any;
  status: number;
}

class ApiError {
  readonly _tag = "ApiError";
  constructor(public status: number, public message: string) {}
}

class TimeoutError {
  readonly _tag = "TimeoutError";
  constructor(public message: string = 'Request timeout') {}
}

class CircuitBreakerError {
  readonly _tag = "CircuitBreakerError";
  constructor(public message: string) {}
}

// Simulated external API
const callExternalApi = (endpoint: string, timeout: number = 5000): Effect.Effect<ApiResponse, ApiError | TimeoutError> =>
  Effect.gen(function* () {
    // Simulate API calls with various failure rates
    const failureRate = endpoint.includes('unstable') ? 0.7 : 0.2;
    
    if (Math.random() < failureRate) {
      const isTimeout = Math.random() < 0.3;
      if (isTimeout) {
        yield* Effect.fail(new TimeoutError(`Timeout calling ${endpoint}`));
      }
      yield* Effect.fail(new ApiError(500, `API error for ${endpoint}`));
    }

    // Random response time
    yield* Effect.sleep(Math.random() * 1000);
    
    return {
      data: { message: `Response from ${endpoint}` },
      status: 200
    };
  }).pipe(
    Effect.timeout(timeout) // Automatic timeout handling
  );

// Retry policies - reusable and composable
const standardRetryPolicy = pipe(
  Schedule.exponential(500), // Start with 500ms, exponentially increase
  Schedule.compose(Schedule.recurs(3)), // Max 3 retries
  Schedule.compose(Schedule.jittered) // Add jitter to prevent thundering herd
);

const unstableRetryPolicy = pipe(
  Schedule.exponential(1000),
  Schedule.compose(Schedule.recurs(5)), // More retries for unstable services
  Schedule.compose(Schedule.jittered)
);

const criticalRetryPolicy = Schedule.once; // No retries - fail fast

// Circuit breaker simulation using Effect's built-in capabilities
const withCircuitBreaker = <A, E>(
  effect: Effect.Effect<A, E>,
  threshold: number = 3
): Effect.Effect<A, E | CircuitBreakerError> => {
  // In a real implementation, this would use Effect's Ref for state management
  // For demo purposes, we'll simulate circuit breaker behavior
  return Effect.gen(function* () {
    const shouldFail = Math.random() < 0.1; // 10% chance circuit is open
    if (shouldFail) {
      yield* Effect.fail(new CircuitBreakerError("Circuit breaker is OPEN"));
    }
    return yield* effect;
  });
};

// Service class using Effect's built-in resilience features
export class ExternalApiService {
  
  fetchUserData = (userId: string): Effect.Effect<any, ApiError | TimeoutError | CircuitBreakerError> =>
    pipe(
      callExternalApi(`/users/${userId}`),
      withCircuitBreaker,
      Effect.retry(standardRetryPolicy),
      Effect.tapError(error => 
        Effect.sync(() => console.log(`Retrying user data fetch: ${error._tag}`))
      )
    );

  fetchUnstableData = (): Effect.Effect<any, ApiError | TimeoutError | CircuitBreakerError> =>
    pipe(
      callExternalApi('/unstable/data'),
      withCircuitBreaker,
      Effect.retry(unstableRetryPolicy),
      Effect.tapError(error => 
        Effect.sync(() => console.log(`Retrying unstable data fetch: ${error._tag}`))
      )
    );

  fetchCriticalData = (): Effect.Effect<any, ApiError | TimeoutError | CircuitBreakerError> =>
    pipe(
      callExternalApi('/critical/data', 2000), // Shorter timeout
      withCircuitBreaker,
      Effect.retry(criticalRetryPolicy), // No retries
      Effect.tapError(error => 
        Effect.sync(() => console.log(`Critical data fetch failed: ${error._tag}`))
      )
    );
}

// Advanced: Composable resilience patterns
const withAdvancedResilience = <A, E>(
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E | CircuitBreakerError> =>
  pipe(
    effect,
    withCircuitBreaker,
    Effect.retry(
      pipe(
        Schedule.exponential(100),
        Schedule.compose(Schedule.recurs(3)),
        Schedule.compose(Schedule.jittered),
        // Only retry on specific errors
        Schedule.whileInput((error: E | CircuitBreakerError) => 
          typeof error === 'object' && '_tag' in error && error._tag !== 'CircuitBreakerError'
        )
      )
    ),
    Effect.timeout(10000) // Global timeout
  );

// Usage example
export const runExample = Effect.gen(function* () {
  console.log("=== Effect-based Retry & Circuit Breaking Example ===");
  
  const apiService = new ExternalApiService();

  // Test different scenarios in parallel
  const tests = [
    { name: "User Data", effect: apiService.fetchUserData("123") },
    { name: "Unstable Data", effect: apiService.fetchUnstableData() },
    { name: "Critical Data", effect: apiService.fetchCriticalData() },
  ];

  for (const test of tests) {
    console.log(`\n--- Testing ${test.name} ---`);
    const startTime = yield* Effect.sync(() => Date.now());
    
    const result = yield* test.effect.pipe(
      Effect.either // Convert failure to success with Either
    );
    
    const duration = yield* Effect.sync(() => Date.now() - startTime);
    
    if (result._tag === 'Right') {
      console.log(`✅ ${test.name}: Success in ${duration}ms`);
    } else {
      console.log(`❌ ${test.name}: ${result.left._tag} - ${result.left.message}`);
    }
  }

  // Demonstrate advanced resilience patterns
  console.log("\n--- Testing Advanced Resilience ---");
  const advancedTest = yield* pipe(
    callExternalApi('/unstable/data'),
    withAdvancedResilience,
    Effect.either
  );

  if (advancedTest._tag === 'Right') {
    console.log("✅ Advanced resilience: Success");
  } else {
    console.log(`❌ Advanced resilience: ${advancedTest.left._tag}`);
  }
});

if (import.meta.main) {
  Effect.runPromise(runExample);
}