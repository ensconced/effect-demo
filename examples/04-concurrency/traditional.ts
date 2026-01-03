/**
 * Traditional Structured Concurrency - Image Processing Pipeline
 * 
 * Problems demonstrated:
 * - Promise.all fails fast, doesn't handle partial failures well
 * - No cancellation propagation between operations
 * - Orphaned operations after errors
 * - Complex coordination between parallel tasks
 * - No structured cleanup on cancellation
 * - Race conditions in state management
 */

import { AbortController } from 'node:util';

interface ImageMetadata {
  id: string;
  originalSize: number;
  variants: ImageVariant[];
  processingTime: number;
}

interface ImageVariant {
  size: string;
  width: number;
  height: number;
  fileSize: number;
  processingTime: number;
}

class ProcessingError extends Error {
  constructor(message: string, public variant?: string) {
    super(message);
    this.name = 'ProcessingError';
  }
}

class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Simulated image processing functions
async function resizeImage(imageData: string, width: number, height: number, signal?: AbortSignal): Promise<ImageVariant> {
  const processingTime = Math.random() * 3000 + 1000; // 1-4 seconds
  const size = `${width}x${height}`;
  
  console.log(`🖼️  Starting resize to ${size}...`);
  
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(`Resize to ${size} was cancelled`));
      return;
    }
    
    const timer = setTimeout(() => {
      // Simulate failures
      if (Math.random() < 0.3) {
        reject(new ProcessingError(`Failed to resize image to ${size}`, size));
        return;
      }
      
      const variant: ImageVariant = {
        size,
        width,
        height,
        fileSize: Math.floor(Math.random() * 500000 + 100000),
        processingTime: Math.floor(processingTime)
      };
      
      console.log(`✅ Resize to ${size} completed in ${variant.processingTime}ms`);
      resolve(variant);
    }, processingTime);
    
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      console.log(`❌ Resize to ${size} cancelled`);
      reject(new Error(`Resize to ${size} was cancelled`));
    });
  });
}

async function uploadVariant(variant: ImageVariant, signal?: AbortSignal): Promise<string> {
  const uploadTime = Math.random() * 2000 + 500; // 0.5-2.5 seconds
  
  console.log(`📤 Starting upload for ${variant.size}...`);
  
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(`Upload for ${variant.size} was cancelled`));
      return;
    }
    
    const timer = setTimeout(() => {
      if (Math.random() < 0.2) {
        reject(new ProcessingError(`Failed to upload ${variant.size}`, variant.size));
        return;
      }
      
      const url = `https://cdn.example.com/${variant.size}-${Date.now()}.jpg`;
      console.log(`✅ Upload for ${variant.size} completed: ${url}`);
      resolve(url);
    }, uploadTime);
    
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      console.log(`❌ Upload for ${variant.size} cancelled`);
      reject(new Error(`Upload for ${variant.size} was cancelled`));
    });
  });
}

export class ImageProcessingService {
  private activeOperations = new Set<Promise<any>>();
  
  /**
   * Process image with Promise.all - fails fast on any error
   */
  async processImageFailFast(imageData: string, imageId: string): Promise<ImageMetadata> {
    const startTime = Date.now();
    const controller = new AbortController();
    
    // Define all the sizes we want to generate
    const sizes = [
      { width: 150, height: 150 },   // thumbnail
      { width: 400, height: 300 },   // small
      { width: 800, height: 600 },   // medium
      { width: 1600, height: 1200 }  // large
    ];
    
    try {
      console.log(`\n🔄 Processing image ${imageId} (fail-fast mode)`);
      
      // Resize all variants in parallel
      const resizePromises = sizes.map(size => 
        resizeImage(imageData, size.width, size.height, controller.signal)
      );
      
      // If ANY resize fails, ALL operations should be cancelled
      const variants = await Promise.all(resizePromises);
      
      // Upload all variants in parallel  
      const uploadPromises = variants.map(variant =>
        uploadVariant(variant, controller.signal).then(url => ({ ...variant, url }))
      );
      
      const uploadedVariants = await Promise.all(uploadPromises);
      
      return {
        id: imageId,
        originalSize: imageData.length,
        variants: uploadedVariants,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      // Cancel all ongoing operations
      controller.abort();
      
      console.log(`❌ Processing ${imageId} failed:`, error instanceof Error ? error.message : error);
      throw error;
    }
  }
  
  /**
   * Process with Promise.allSettled - partial failures allowed
   */
  async processImagePartialFailure(imageData: string, imageId: string): Promise<ImageMetadata> {
    const startTime = Date.now();
    const controller = new AbortController();
    
    const sizes = [
      { width: 150, height: 150 },
      { width: 400, height: 300 },
      { width: 800, height: 600 },
      { width: 1600, height: 1200 }
    ];
    
    try {
      console.log(`\n🔄 Processing image ${imageId} (partial failure mode)`);
      
      // Resize all variants - some may fail
      const resizePromises = sizes.map(size => 
        resizeImage(imageData, size.width, size.height, controller.signal)
      );
      
      const resizeResults = await Promise.allSettled(resizePromises);
      
      // Extract successful variants
      const successfulVariants: ImageVariant[] = [];
      const failedSizes: string[] = [];
      
      resizeResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulVariants.push(result.value);
        } else {
          const size = `${sizes[index].width}x${sizes[index].height}`;
          failedSizes.push(size);
          console.log(`❌ Resize failed for ${size}:`, result.reason.message);
        }
      });
      
      if (successfulVariants.length === 0) {
        throw new ProcessingError('All resize operations failed');
      }
      
      // Upload successful variants
      const uploadPromises = successfulVariants.map(async variant => {
        try {
          const url = await uploadVariant(variant, controller.signal);
          return { ...variant, url };
        } catch (error) {
          console.log(`❌ Upload failed for ${variant.size}:`, error instanceof Error ? error.message : error);
          return null;
        }
      });
      
      const uploadResults = await Promise.allSettled(uploadPromises);
      const finalVariants = uploadResults
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => (result as PromiseFulfilledResult<ImageVariant>).value);
      
      if (finalVariants.length === 0) {
        throw new ProcessingError('All upload operations failed');
      }
      
      console.log(`✅ Processed ${imageId}: ${finalVariants.length}/${sizes.length} variants successful`);
      if (failedSizes.length > 0) {
        console.log(`⚠️  Failed sizes: ${failedSizes.join(', ')}`);
      }
      
      return {
        id: imageId,
        originalSize: imageData.length,
        variants: finalVariants,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      controller.abort();
      console.log(`❌ Processing ${imageId} completely failed:`, error instanceof Error ? error.message : error);
      throw error;
    }
  }
  
  /**
   * Process multiple images with complex coordination
   */
  async processBatch(images: Array<{ id: string, data: string }>): Promise<ImageMetadata[]> {
    console.log(`\n🔄 Processing batch of ${images.length} images`);
    
    const results: ImageMetadata[] = [];
    const errors: Error[] = [];
    
    // Process images with limited concurrency
    const concurrencyLimit = 2;
    const chunks = [];
    
    for (let i = 0; i < images.length; i += concurrencyLimit) {
      chunks.push(images.slice(i, i + concurrencyLimit));
    }
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async image => {
        try {
          return await this.processImagePartialFailure(image.data, image.id);
        } catch (error) {
          errors.push(error as Error);
          return null;
        }
      });
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      chunkResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value !== null) {
          results.push(result.value);
        }
      });
    }
    
    console.log(`✅ Batch complete: ${results.length}/${images.length} images processed successfully`);
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} images failed to process`);
    }
    
    return results;
  }
}

// Usage example
export async function runExample() {
  console.log("=== Traditional Structured Concurrency Example ===");
  
  const service = new ImageProcessingService();
  const testImageData = "fake-image-data-" + "x".repeat(1000);
  
  // Test fail-fast processing
  try {
    console.log("\n--- Fail-Fast Processing ---");
    const result1 = await service.processImageFailFast(testImageData, "img-001");
    console.log(`Success: ${result1.variants.length} variants processed`);
  } catch (error) {
    console.log(`Fail-fast failed:`, error instanceof Error ? error.message : error);
  }
  
  // Test partial failure processing
  try {
    console.log("\n--- Partial Failure Processing ---");
    const result2 = await service.processImagePartialFailure(testImageData, "img-002");
    console.log(`Partial success: ${result2.variants.length} variants processed`);
  } catch (error) {
    console.log(`Partial failure processing failed:`, error instanceof Error ? error.message : error);
  }
  
  // Test batch processing
  console.log("\n--- Batch Processing ---");
  const batchImages = [
    { id: "batch-001", data: testImageData },
    { id: "batch-002", data: testImageData },
    { id: "batch-003", data: testImageData },
  ];
  
  try {
    const batchResults = await service.processBatch(batchImages);
    console.log(`Batch results: ${batchResults.length} images processed`);
  } catch (error) {
    console.log(`Batch processing failed:`, error instanceof Error ? error.message : error);
  }
  
  console.log('\n⚠️  Note: Some operations might still be running in the background!');
}

if (import.meta.main) {
  runExample();
}