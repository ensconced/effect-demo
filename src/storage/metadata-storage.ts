import * as fs from 'fs/promises';
import * as path from 'path';
import { ImageMetadata, DatabaseError, ProcessingConfig } from '../types.ts';

/**
 * Metadata storage layer - simulates DynamoDB
 * Notice the imperative style and manual state management
 */
export class MetadataStorage {
  private readonly dbPath: string;
  private cache: Map<string, ImageMetadata> = new Map();
  private initialized: boolean = false;

  constructor(dbPath: string = './data/metadata.json') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const dir = path.dirname(this.dbPath);
      await fs.mkdir(dir, { recursive: true });

      // Try to load existing data
      try {
        const data = await fs.readFile(this.dbPath, 'utf-8');
        const parsed = JSON.parse(data);

        // Reconstruct dates from JSON
        for (const [id, metadata] of Object.entries(parsed)) {
          this.cache.set(id, {
            ...(metadata as any),
            uploadedAt: new Date((metadata as any).uploadedAt),
            processedAt: (metadata as any).processedAt
              ? new Date((metadata as any).processedAt)
              : undefined,
          });
        }
      } catch (error: any) {
        // If file doesn't exist, start with empty cache
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      throw new DatabaseError(
        'Failed to initialize metadata storage',
        error instanceof Error ? error : undefined
      );
    }
  }

  async save(metadata: ImageMetadata, config?: ProcessingConfig): Promise<void> {
    this.ensureInitialized();

    // Inject metadata failure
    if (config?.shouldFailMetadata) {
      throw new DatabaseError('Simulated metadata save failure');
    }

    try {
      this.cache.set(metadata.id, metadata);
      await this.persist();
    } catch (error) {
      throw new DatabaseError(
        `Failed to save metadata for image ${metadata.id}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async get(id: string): Promise<ImageMetadata> {
    this.ensureInitialized();

    const metadata = this.cache.get(id);
    if (!metadata) {
      throw new DatabaseError(`Image not found: ${id}`);
    }

    return metadata;
  }

  async delete(id: string): Promise<void> {
    this.ensureInitialized();

    const existed = this.cache.delete(id);
    if (!existed) {
      throw new DatabaseError(`Image not found: ${id}`);
    }

    try {
      await this.persist();
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete metadata for image ${id}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async list(): Promise<ImageMetadata[]> {
    this.ensureInitialized();
    return Array.from(this.cache.values());
  }

  async exists(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.cache.has(id);
  }

  /**
   * Persist the cache to disk
   * Notice how we manually handle serialization and errors
   */
  private async persist(): Promise<void> {
    try {
      // Convert Map to plain object for JSON serialization
      const data: Record<string, any> = {};
      for (const [id, metadata] of this.cache.entries()) {
        data[id] = metadata;
      }

      await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      throw new DatabaseError(
        'Failed to persist metadata to disk',
        error instanceof Error ? error : undefined
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new DatabaseError('MetadataStorage not initialized. Call initialize() first.');
    }
  }
}
