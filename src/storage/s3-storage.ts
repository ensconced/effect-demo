import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageError, NetworkError } from '../types.ts';
import type { ProcessingConfig } from '../types.ts';

/**
 * S3 Storage layer - simulates AWS S3
 *
 * PAIN POINTS TO NOTICE:
 * 1. Duplicated retry logic (same as file-storage.ts and cdn-publisher.ts)
 * 2. Hard-coded retry parameters
 * 3. Manual error handling
 * 4. No declarative way to change retry strategy
 */
export class S3Storage {
  private readonly basePath: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelayMs: number = 100;

  constructor(basePath: string = './data/s3') {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      throw new StorageError(
        `Failed to initialize S3 storage at ${this.basePath}`,
        's3',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Upload file to S3 with retry logic
   * Notice: retry logic is DUPLICATED from file-storage.ts!
   */
  async uploadFile(
    filePath: string,
    key: string,
    config?: ProcessingConfig
  ): Promise<string> {
    console.log(`Uploading to S3: ${key}...`);

    // Inject S3 failure
    if (config?.shouldFailS3) {
      throw new StorageError('Simulated S3 upload failure', 's3');
    }

    const s3Path = path.join(this.basePath, key);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Simulate network issues
        if (Math.random() < (config?.failureRate || 0)) {
          throw new NetworkError('Simulated network failure during S3 upload');
        }

        // Simulate upload time
        await this.sleep(100);

        // Read source file
        const content = await fs.readFile(filePath);

        // Ensure directory exists
        await fs.mkdir(path.dirname(s3Path), { recursive: true });

        // Write to "S3" (local directory for demo)
        await fs.writeFile(s3Path, content);

        const url = `s3://${this.basePath}/${key}`;
        console.log(`✓ Uploaded to S3: ${url}`);
        return url;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry non-network errors
        if (!(error instanceof NetworkError)) {
          break;
        }

        const hasRetriesLeft = attempt < this.maxRetries;
        if (!hasRetriesLeft) {
          break;
        }

        // Exponential backoff (duplicated logic!)
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        console.log(`S3 upload failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${this.maxRetries})`);
        await this.sleep(delay);
      }
    }

    throw new StorageError(
      `Failed to upload to S3 after ${this.maxRetries + 1} attempts`,
      's3',
      lastError
    );
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    const s3Path = path.join(this.basePath, key);

    try {
      await fs.unlink(s3Path);
      console.log(`✓ Deleted from S3: ${key}`);
    } catch (error: any) {
      // Ignore if file doesn't exist
      if (error.code === 'ENOENT') {
        return;
      }
      throw new StorageError(`Failed to delete from S3: ${key}`, 's3', error);
    }
  }

  /**
   * Get file URL
   */
  getUrl(key: string): string {
    return `s3://${this.basePath}/${key}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
