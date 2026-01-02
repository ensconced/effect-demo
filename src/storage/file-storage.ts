import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageError, NetworkError, ProcessingConfig } from '../types.ts';

/**
 * File storage layer - local file system storage
 * Notice the complex error handling, retry logic, and lack of composability
 */
export class FileStorage {
  private readonly basePath: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelayMs: number = 100;

  constructor(basePath: string = './data/files') {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      throw new StorageError(
        `Failed to initialize storage at ${this.basePath}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Save file with retry logic
   * Notice how messy retry logic is without proper abstractions
   */
  async saveFile(id: string, content: Buffer, config?: ProcessingConfig): Promise<void> {
    // Inject storage failure
    if (config?.shouldFailStorage) {
      throw new StorageError('Simulated storage failure', 'file-system');
    }

    const filePath = this.getFilePath(id);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Simulate potential network issues
        if (Math.random() < (config?.failureRate || 0.1) && attempt < 2) {
          throw new NetworkError('Simulated network failure');
        }

        await fs.writeFile(filePath, content);
        return; // Success!
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Should we retry?
        const isRetryable = error instanceof NetworkError && error.retryable;
        const hasRetriesLeft = attempt < this.maxRetries;

        if (!isRetryable || !hasRetriesLeft) {
          break; // Don't retry
        }

        // Wait before retrying with exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // All retries failed
    throw new StorageError(
      `Failed to save file ${id} after ${this.maxRetries + 1} attempts`,
      lastError
    );
  }

  /**
   * Read file with retry logic
   * More duplicated retry code - not DRY!
   */
  async readFile(id: string): Promise<Buffer> {
    const filePath = this.getFilePath(id);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Check if file exists first
        try {
          await fs.access(filePath);
        } catch {
          throw new StorageError(`File not found: ${id}`);
        }

        // Simulate potential network issues
        if (Math.random() < 0.1 && attempt < 2) {
          throw new NetworkError('Simulated network failure');
        }

        const content = await fs.readFile(filePath);
        return content;
      } catch (error) {
        // Don't retry if file doesn't exist
        if (error instanceof StorageError && error.message.includes('not found')) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        const isRetryable = error instanceof NetworkError && error.retryable;
        const hasRetriesLeft = attempt < this.maxRetries;

        if (!isRetryable || !hasRetriesLeft) {
          break;
        }

        const delay = this.retryDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw new StorageError(
      `Failed to read file ${id} after ${this.maxRetries + 1} attempts`,
      lastError
    );
  }

  async deleteFile(id: string): Promise<void> {
    const filePath = this.getFilePath(id);

    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      // Ignore if file doesn't exist
      if (error.code === 'ENOENT') {
        return;
      }
      throw new StorageError(`Failed to delete file ${id}`, error);
    }
  }

  async listFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files.map(f => path.basename(f, '.txt'));
    } catch (error) {
      throw new StorageError('Failed to list files', error instanceof Error ? error : undefined);
    }
  }

  private getFilePath(id: string): string {
    return path.join(this.basePath, `${id}.jpg`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
