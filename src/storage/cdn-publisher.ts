import { NetworkError } from '../types.ts';
import type { ProcessingConfig } from '../types.ts';

/**
 * CDN Publisher - simulates publishing to CDN (CloudFront, Cloudflare, etc.)
 *
 * PAIN POINTS TO NOTICE:
 * 1. YET ANOTHER copy of retry logic (third time!)
 * 2. Different retry parameters but same pattern
 * 3. What if we want circuit breaker? Retry budget? Jittered backoff?
 * 4. All of these require rewriting the same retry loop
 */
export class CDNPublisher {
  private readonly cdnBaseUrl: string;
  private readonly maxRetries: number = 5; // CDN retries more
  private readonly retryDelayMs: number = 200; // CDN has longer delays

  constructor(cdnBaseUrl: string = 'https://cdn.example.com') {
    this.cdnBaseUrl = cdnBaseUrl;
  }

  /**
   * Publish file to CDN
   * Notice: this retry logic is ALMOST identical to S3Storage and FileStorage
   * Just different parameters and error messages
   * This is the definition of code duplication!
   */
  async publishFile(
    s3Url: string,
    key: string,
    config?: ProcessingConfig
  ): Promise<string> {
    console.log(`Publishing to CDN: ${key}...`);

    // Inject CDN failure
    if (config?.shouldFailCDN) {
      throw new NetworkError('Simulated CDN publish failure', false); // Not retryable
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Simulate intermittent network issues (higher rate than S3)
        if (Math.random() < (config?.failureRate || 0.2)) {
          throw new NetworkError('Simulated network failure during CDN publish');
        }

        // Simulate CDN publish time (longer than S3)
        await this.sleep(150 + Math.random() * 100);

        const cdnUrl = `${this.cdnBaseUrl}/${key}`;
        console.log(`✓ Published to CDN: ${cdnUrl}`);
        return cdnUrl;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable =
          error instanceof NetworkError && error.retryable;

        const hasRetriesLeft = attempt < this.maxRetries;

        if (!isRetryable || !hasRetriesLeft) {
          break;
        }

        // Exponential backoff with different parameters
        // Notice: same pattern, different numbers!
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        console.log(`CDN publish failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${this.maxRetries})`);
        await this.sleep(delay);
      }
    }

    throw new NetworkError(
      `Failed to publish to CDN after ${this.maxRetries + 1} attempts`,
      false, // Not retryable after max attempts
      lastError
    );
  }

  /**
   * Invalidate CDN cache
   */
  async invalidate(key: string): Promise<void> {
    console.log(`Invalidating CDN cache for: ${key}...`);
    await this.sleep(50);
    console.log(`✓ CDN cache invalidated for: ${key}`);
  }

  /**
   * Get CDN URL
   */
  getUrl(key: string): string {
    return `${this.cdnBaseUrl}/${key}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
