import { randomUUID } from 'crypto';
import { ImageProcessor } from '../processing/image-processor.ts';
import { FileStorage } from '../storage/file-storage.ts';
import { S3Storage } from '../storage/s3-storage.ts';
import { CDNPublisher } from '../storage/cdn-publisher.ts';
import { MetadataStorage } from '../storage/metadata-storage.ts';
import {
  ProcessingError,
  StorageError,
  DatabaseError,
} from '../types.ts';
import type {
  ImageMetadata,
  ImageVariant,
  ImageSize,
  UploadImageInput,
  ProcessingConfig,
} from '../types.ts';
import { validateUploadInput, validateImageId } from '../validation.ts';

/**
 * Image Processing Service - orchestrates the entire pipeline
 *
 * PAIN POINTS TO NOTICE (THIS IS THE WORST FILE):
 * 1. EXTREMELY complex error handling with 5+ nested try-catch blocks
 * 2. Manual "transaction" management across 4 systems (files, S3, CDN, DB)
 * 3. Complex rollback logic that can itself fail
 * 4. State tracking (what succeeded so far) is manual and error-prone
 * 5. No clear separation of concerns
 * 6. Hard-coded dependencies - impossible to test
 * 7. Error types checked with instanceof everywhere
 * 8. If ANY step fails, we might leave orphaned resources
 */
export class ImageService {
  private processor: ImageProcessor;
  private fileStorage: FileStorage;
  private s3Storage: S3Storage;
  private cdnPublisher: CDNPublisher;
  private metadataStorage: MetadataStorage;

  constructor(
    processor: ImageProcessor,
    fileStorage: FileStorage,
    s3Storage: S3Storage,
    cdnPublisher: CDNPublisher,
    metadataStorage: MetadataStorage
  ) {
    this.processor = processor;
    this.fileStorage = fileStorage;
    this.s3Storage = s3Storage;
    this.cdnPublisher = cdnPublisher;
    this.metadataStorage = metadataStorage;
  }

  async initialize(): Promise<void> {
    // Notice: manual initialization of 5 dependencies
    // What if one succeeds and another fails?
    try {
      await this.processor.initialize();
      await this.fileStorage.initialize();
      await this.s3Storage.initialize();
      await this.metadataStorage.initialize();
    } catch (error) {
      if (error instanceof StorageError) {
        throw new StorageError('Failed to initialize image service', undefined, error);
      } else if (error instanceof DatabaseError) {
        throw new DatabaseError('Failed to initialize image service', error);
      }
      throw error;
    }
  }

  /**
   * Process uploaded image - THE COMPLEXITY SHOWCASE
   *
   * This method demonstrates ALL the pain points:
   * - Pipeline: validate → extract → resize → optimize → store → S3 → CDN → DB
   * - Each step can fail independently
   * - Partial failures require complex cleanup
   * - Rollback logic is manual and can fail too
   */
  async processImage(
    input: UploadImageInput,
    config?: ProcessingConfig
  ): Promise<ImageMetadata> {
    console.log('\n=== Starting Image Processing Pipeline ===');

    // Step 1: Validate input (can throw ValidationError)
    const validatedInput = validateUploadInput(input, config);
    const imageId = randomUUID();

    // Track what we've done so far for rollback
    let tempFilesCreated: string[] = [];
    let fileStorageSaved = false;
    let s3Uploaded = false;
    let cdnPublished = false;
    let metadataSaved = false;

    try {
      // Step 2: Extract dimensions
      console.log('Step 1: Extracting dimensions...');
      const dimensions = await this.processor.extractDimensions(validatedInput.file);
      console.log(`✓ Dimensions: ${dimensions.width}x${dimensions.height}`);

      // Step 3: Resize to all sizes (COMPLEX: parallel operation with partial failure handling)
      console.log('\nStep 2: Resizing to multiple sizes...');
      const variants = await this.processor.resizeToAllSizes(
        validatedInput.file,
        dimensions,
        imageId,
        config
      );

      // Collect temp file paths for cleanup
      tempFilesCreated = Object.values(variants).map((v) => v.filePath);
      console.log(`✓ Created ${tempFilesCreated.length} variants`);

      // Step 4: Optimize each variant (another loop with potential failures)
      console.log('\nStep 3: Optimizing images...');
      for (const [size, variant] of Object.entries(variants)) {
        try {
          await this.processor.optimize(variant.filePath, config);
        } catch (error) {
          // If optimization fails, do we fail the whole upload?
          // Or continue with un-optimized images?
          // This decision is buried in code, not declarative
          console.warn(`Warning: Failed to optimize ${size}, continuing anyway`);
        }
      }

      // Step 5: Save to local file storage
      console.log('\nStep 4: Saving to file storage...');
      try {
        await this.fileStorage.saveFile(
          `${imageId}-original`,
          validatedInput.file,
          config
        );
        fileStorageSaved = true;
        console.log('✓ Saved to file storage');
      } catch (error) {
        throw new StorageError('Failed to save to file storage', 'file', error as Error);
      }

      // Step 6: Upload all variants to S3
      console.log('\nStep 5: Uploading to S3...');
      const s3Uploads: Array<{ size: ImageSize; url: string }> = [];
      try {
        for (const [size, variant] of Object.entries(variants) as Array<
          [ImageSize, ImageVariant]
        >) {
          const s3Key = `images/${imageId}/${size}.jpg`;
          const s3Url = await this.s3Storage.uploadFile(variant.filePath, s3Key, config);
          s3Uploads.push({ size, url: s3Url });
          variant.s3Url = s3Url;
        }
        s3Uploaded = true;
        console.log(`✓ Uploaded ${s3Uploads.length} files to S3`);
      } catch (error) {
        throw new StorageError('Failed to upload to S3', 's3', error as Error);
      }

      // Step 7: Publish to CDN
      console.log('\nStep 6: Publishing to CDN...');
      try {
        for (const [size, variant] of Object.entries(variants) as Array<
          [ImageSize, ImageVariant]
        >) {
          if (!variant.s3Url) continue;
          const cdnKey = `images/${imageId}/${size}.jpg`;
          const cdnUrl = await this.cdnPublisher.publishFile(variant.s3Url, cdnKey, config);
          variant.cdnUrl = cdnUrl;
        }
        cdnPublished = true;
        console.log('✓ Published to CDN');
      } catch (error) {
        throw new StorageError('Failed to publish to CDN', 'cdn', error as Error);
      }

      // Step 8: Save metadata to database
      console.log('\nStep 7: Saving metadata...');
      const metadata: ImageMetadata = {
        id: imageId,
        originalName: validatedInput.originalName,
        mimeType: validatedInput.mimeType,
        fileSize: validatedInput.file.length,
        dimensions,
        uploadedAt: new Date(),
        processedAt: new Date(),
        sizes: variants,
        tags: validatedInput.tags,
        userId: validatedInput.userId,
      };

      try {
        await this.metadataStorage.save(metadata, config);
        metadataSaved = true;
        console.log('✓ Metadata saved');
      } catch (error) {
        throw new DatabaseError('Failed to save metadata', error as Error);
      }

      // Step 9: Cleanup temp files (best effort)
      console.log('\nStep 8: Cleaning up temp files...');
      try {
        await this.processor.cleanupFiles(tempFilesCreated);
        console.log('✓ Temp files cleaned up');
      } catch (error) {
        // Just log, don't fail the whole operation
        console.warn('Warning: Failed to cleanup some temp files:', error);
      }

      console.log('\n=== Image Processing Complete ===\n');
      return metadata;
    } catch (error) {
      // ============================================================
      // ROLLBACK LOGIC - THIS IS THE NIGHTMARE
      // Notice how complex this is and how it can itself fail!
      // ============================================================
      console.error('\n!!! Error during processing, attempting rollback !!!');
      console.error('Error:', error);

      const rollbackErrors: Error[] = [];

      // Rollback 1: Delete from CDN (if published)
      if (cdnPublished) {
        console.log('Rolling back: CDN invalidation...');
        try {
          for (const size of Object.keys(variants)) {
            await this.cdnPublisher.invalidate(`images/${imageId}/${size}.jpg`);
          }
        } catch (rbError) {
          rollbackErrors.push(rbError as Error);
          console.error('Rollback failed: CDN invalidation:', rbError);
        }
      }

      // Rollback 2: Delete from S3 (if uploaded)
      if (s3Uploaded) {
        console.log('Rolling back: S3 deletion...');
        try {
          for (const size of Object.keys(variants)) {
            await this.s3Storage.deleteFile(`images/${imageId}/${size}.jpg`);
          }
        } catch (rbError) {
          rollbackErrors.push(rbError as Error);
          console.error('Rollback failed: S3 deletion:', rbError);
        }
      }

      // Rollback 3: Delete from file storage (if saved)
      if (fileStorageSaved) {
        console.log('Rolling back: File storage deletion...');
        try {
          await this.fileStorage.deleteFile(`${imageId}-original`);
        } catch (rbError) {
          rollbackErrors.push(rbError as Error);
          console.error('Rollback failed: File deletion:', rbError);
        }
      }

      // Rollback 4: Cleanup temp files (best effort)
      if (tempFilesCreated.length > 0) {
        console.log('Rolling back: Temp file cleanup...');
        try {
          await this.processor.cleanupFiles(tempFilesCreated);
        } catch (rbError) {
          // Not critical
          console.warn('Temp file cleanup warning:', rbError);
        }
      }

      // If rollback itself failed, we're in BIG trouble
      if (rollbackErrors.length > 0) {
        console.error(`\n!!! CRITICAL: ${rollbackErrors.length} rollback operations failed !!!`);
        console.error('System may be in inconsistent state!');
      }

      // Re-throw the original error
      throw error;
    }
  }

  async getImage(id: string): Promise<ImageMetadata> {
    validateImageId(id);

    try {
      return await this.metadataStorage.get(id);
    } catch (error) {
      throw new DatabaseError(`Failed to get image ${id}`, error as Error);
    }
  }

  async deleteImage(id: string): Promise<void> {
    validateImageId(id);

    // Get metadata first
    const metadata = await this.getImage(id);

    // Delete from all systems (notice: partial failures possible here too!)
    const errors: Error[] = [];

    // Delete from CDN
    try {
      for (const size of Object.keys(metadata.sizes)) {
        await this.cdnPublisher.invalidate(`images/${id}/${size}.jpg`);
      }
    } catch (error) {
      errors.push(error as Error);
    }

    // Delete from S3
    try {
      for (const size of Object.keys(metadata.sizes)) {
        await this.s3Storage.deleteFile(`images/${id}/${size}.jpg`);
      }
    } catch (error) {
      errors.push(error as Error);
    }

    // Delete from file storage
    try {
      await this.fileStorage.deleteFile(`${id}-original`);
    } catch (error) {
      errors.push(error as Error);
    }

    // Delete metadata
    try {
      await this.metadataStorage.delete(id);
    } catch (error) {
      errors.push(error as Error);
    }

    // How do we report multiple errors?
    if (errors.length > 0) {
      throw new Error(`Failed to fully delete image (${errors.length} errors): ${errors[0].message}`);
    }
  }

  async listImages(): Promise<ImageMetadata[]> {
    try {
      return await this.metadataStorage.list();
    } catch (error) {
      throw new DatabaseError('Failed to list images', error as Error);
    }
  }
}
