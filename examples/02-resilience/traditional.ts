/**
 * Traditional Retry & Circuit Breaking - External API Client
 * 
 * Problems demonstrated:
 * - Manual retry logic duplicated across functions
 * - No exponential backoff or jitter
 * - Circuit breaker state management is complex
 * - Hard to configure retry policies
 * - No automatic timeout handling
 * - Difficult to test retry behavior
 */

interface ApiResponse {
  data: any;
  status: number;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

class TimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Manual circuit breaker implementation
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker is OPEN');
      } else {
        this.state = 'HALF_OPEN';
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// Manual retry implementation
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }

      // Simple exponential backoff (no jitter)
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError!;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Simulated external API
async function callExternalApi(endpoint: string, timeout: number = 5000): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Simulate API calls with various failure rates
    const failureRate = endpoint.includes('unstable') ? 0.7 : 0.2;
    
    if (Math.random() < failureRate) {
      const isTimeout = Math.random() < 0.3;
      if (isTimeout) {
        await sleep(timeout + 100); // Force timeout
      }
      throw new ApiError(500, `API error for ${endpoint}`);
    }

    await sleep(Math.random() * 1000); // Random response time
    
    return {
      data: { message: `Response from ${endpoint}` },
      status: 200
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Service class with manual retry and circuit breaker logic
export class ExternalApiService {
  private circuitBreaker = new CircuitBreaker(3, 30000);
  
  async fetchUserData(userId: string): Promise<any> {
    return await this.circuitBreaker.execute(() =>
      withRetry(
        () => callExternalApi(`/users/${userId}`),
        3,
        500
      )
    );
  }

  async fetchUnstableData(): Promise<any> {
    // Different retry configuration for unstable endpoint
    return await this.circuitBreaker.execute(() =>
      withRetry(
        () => callExternalApi('/unstable/data'),
        5, // More retries for unstable endpoint
        1000
      )
    );
  }

  async fetchCriticalData(): Promise<any> {
    // No retries for critical data - fail fast
    return await this.circuitBreaker.execute(() =>
      callExternalApi('/critical/data', 2000) // Shorter timeout
    );
  }
}

// Usage example
export async function runExample() {
  console.log("=== Traditional Retry & Circuit Breaking Example ===");
  
  const apiService = new ExternalApiService();

  // Test different scenarios
  const tests = [
    { name: "User Data", fn: () => apiService.fetchUserData("123") },
    { name: "Unstable Data", fn: () => apiService.fetchUnstableData() },
    { name: "Critical Data", fn: () => apiService.fetchCriticalData() },
  ];

  for (const test of tests) {
    console.log(`\n--- Testing ${test.name} ---`);
    try {
      const startTime = Date.now();
      const result = await test.fn();
      const duration = Date.now() - startTime;
      console.log(`✅ ${test.name}: Success in ${duration}ms`);
    } catch (error) {
      console.log(`❌ ${test.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Force circuit breaker to open by making multiple failing requests
  console.log("\n--- Testing Circuit Breaker ---");
  for (let i = 0; i < 6; i++) {
    try {
      await apiService.fetchUnstableData();
    } catch (error) {
      console.log(`Failure ${i + 1}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

