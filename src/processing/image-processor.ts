import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SIZE_CONFIGS,
  ProcessingError,
  ResourceError,
} from '../types.ts';
import type {
  ImageSize,
  ImageDimensions,
  ImageVariant,
  ProcessingConfig,
} from '../types.ts';
import { validateImageDimensions } from '../validation.ts';

/**
 * Image Processor - simulates image resize and optimize operations
 *
 * PAIN POINTS TO NOTICE:
 * 1. Parallel operations with Promise.allSettled - messy error handling
 * 2. Resource management - temp files need cleanup
 * 3. Partial failures - what if 2/4 sizes succeed?
 * 4. No composable retry logic
 */
export class ImageProcessor {
  private readonly tempDir: string;

  constructor(tempDir: string = './data/temp') {
    this.tempDir = tempDir;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      throw new ResourceError(
        `Failed to initialize temp directory at ${this.tempDir}`,
        'temp-dir',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Extract image dimensions (simulated)
   * In real app, would use sharp or jimp
   */
  async extractDimensions(file: Buffer): Promise<ImageDimensions> {
    // Simulate processing time
    await this.sleep(50);

    // Simulate extraction (just use random dimensions for demo)
    const width = 1920 + Math.floor(Math.random() * 1000);
    const height = 1080 + Math.floor(Math.random() * 1000);

    validateImageDimensions(width, height);

    return { width, height };
  }

  /**
   * Resize image to multiple sizes - demonstrates parallel operation complexity
   *
   * This is where things get messy:
   * - Need to process 4 sizes in parallel for performance
   * - But what if some succeed and others fail?
   * - Need to clean up the successful ones if overall operation fails
   * - Promise.allSettled gives results, but we have to manually interpret them
   */
  async resizeToAllSizes(
    file: Buffer,
    originalDimensions: ImageDimensions,
    imageId: string,
    config?: ProcessingConfig
  ): Promise<Record<ImageSize, ImageVariant>> {
    const sizes: ImageSize[] = ['thumbnail', 'small', 'medium', 'large'];

    console.log(`Starting resize for ${sizes.length} sizes...`);

    // Run all resizes in parallel - but handling failures is complex!
    const results = await Promise.allSettled(
      sizes.map((size) => this.resizeSingle(file, size, originalDimensions, imageId, config))
    );

    // Now we need to manually check each result
    const succeeded: ImageVariant[] = [];
    const failed: Array<{ size: ImageSize; error: any }> = [];
    const tempFiles: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const size = sizes[i];

      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
        tempFiles.push(result.value.filePath);
      } else {
        failed.push({ size, error: result.reason });
      }
    }

    console.log(`Resize results: ${succeeded.length} succeeded, ${failed.length} failed`);

    // What do we do with partial failures?
    // Option 1: Fail if ANY failed (wasteful - throws away good work)
    // Option 2: Accept partial success (inconsistent state)
    // Option 3: Retry the failed ones (complex retry logic)

    if (failed.length > 0) {
      // Clean up the ones that succeeded
      console.log('Cleaning up successful resizes due to partial failure...');
      await this.cleanupFiles(tempFiles);

      const errorMessages = failed.map((f) => `${f.size}: ${f.error.message}`).join(', ');
      throw new ProcessingError(
        `Failed to resize ${failed.length}/${sizes.length} sizes: ${errorMessages}`,
        'resize',
        failed[0].error
      );
    }

    // Convert array to record
    const variants: Record<ImageSize, ImageVariant> = {} as any;
    for (const variant of succeeded) {
      variants[variant.size] = variant;
    }

    // Add original
    variants.original = {
      size: 'original',
      dimensions: originalDimensions,
      fileSize: file.length,
      filePath: path.join(this.tempDir, `${imageId}-original.jpg`),
    };

    // Save original to temp
    await fs.writeFile(variants.original.filePath, file);

    return variants;
  }

  /**
   * Resize single image size (simulated)
   * Includes error injection for demo purposes
   */
  private async resizeSingle(
    file: Buffer,
    size: ImageSize,
    originalDimensions: ImageDimensions,
    imageId: string,
    config?: ProcessingConfig
  ): Promise<ImageVariant> {
    console.log(`Resizing to ${size}...`);

    // Inject resize failure if requested
    if (config?.shouldFailResize) {
      throw new ProcessingError(`Simulated resize failure for ${size}`, 'resize');
    }

    // Inject partial failure (fail only some sizes)
    if (config?.shouldFailResizePartial) {
      // Fail small and large sizes
      if (size === 'small' || size === 'large') {
        throw new ProcessingError(`Simulated partial resize failure for ${size}`, 'resize');
      }
    }

    // Simulate processing time (larger sizes take longer)
    const processingTime = size === 'thumbnail' ? 100 : size === 'small' ? 200 : size === 'medium' ? 300 : 400;
    await this.sleep(processingTime);

    // Simulate random failures based on config
    if (config?.failureRate && Math.random() < config.failureRate) {
      throw new ProcessingError(`Random failure during ${size} resize`, 'resize');
    }

    const targetDimensions = SIZE_CONFIGS[size];

    // Calculate scaled dimensions (maintain aspect ratio)
    const scaledDimensions = this.calculateScaledDimensions(originalDimensions, targetDimensions);

    // Simulate resized file size (smaller than original)
    const resizedFileSize = Math.floor(file.length * (scaledDimensions.width / originalDimensions.width) * 0.7);

    const filePath = path.join(this.tempDir, `${imageId}-${size}.jpg`);

    // Create a dummy file (in real app, would use sharp to actually resize)
    await fs.writeFile(filePath, Buffer.alloc(resizedFileSize, 0));

    console.log(`✓ Resized to ${size}: ${scaledDimensions.width}x${scaledDimensions.height}`);

    return {
      size,
      dimensions: scaledDimensions,
      fileSize: resizedFileSize,
      filePath,
    };
  }

  /**
   * Optimize image (simulated)
   * Demonstrates resource-intensive operation with error handling
   */
  async optimize(filePath: string, config?: ProcessingConfig): Promise<void> {
    console.log(`Optimizing ${path.basename(filePath)}...`);

    // Inject optimization failure
    if (config?.shouldFailOptimize) {
      throw new ProcessingError('Simulated optimization failure', 'optimize');
    }

    // Simulate optimization time
    await this.sleep(150);

    // In real app, would use sharp or imagemin
    // For demo, we just simulate by "rewriting" the file
    const stats = await fs.stat(filePath);
    console.log(`✓ Optimized ${path.basename(filePath)} (${stats.size} bytes)`);
  }

  /**
   * Clean up temporary files
   * Notice: if THIS fails, we have orphaned files!
   */
  async cleanupFiles(filePaths: string[]): Promise<void> {
    const errors: Error[] = [];

    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Should we fail the whole operation if cleanup fails?
        // Or just log and continue?
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`Failed to delete temp file ${filePath}:`, error);
      }
    }

    if (errors.length > 0) {
      throw new ResourceError(
        `Failed to cleanup ${errors.length} temp files`,
        'temp-file',
        errors[0]
      );
    }
  }

  private calculateScaledDimensions(
    original: ImageDimensions,
    target: ImageDimensions
  ): ImageDimensions {
    const aspectRatio = original.width / original.height;
    const targetAspectRatio = target.width / target.height;

    let width: number;
    let height: number;

    if (aspectRatio > targetAspectRatio) {
      // Original is wider, fit to width
      width = Math.min(original.width, target.width);
      height = Math.round(width / aspectRatio);
    } else {
      // Original is taller, fit to height
      height = Math.min(original.height, target.height);
      width = Math.round(height * aspectRatio);
    }

    return { width, height };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
