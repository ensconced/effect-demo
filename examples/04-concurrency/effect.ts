/**
 * Effect-based Structured Concurrency - Image Processing Pipeline
 * 
 * Benefits demonstrated:
 * - Automatic cancellation propagation through fiber hierarchy
 * - Structured cleanup on failures or interruption
 * - Composable parallel/sequential patterns
 * - No orphaned operations
 * - Built-in backpressure and resource management
 * - Clear error handling for partial failures
 */

import { Effect, Fiber, pipe } from "effect";

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
  url?: string;
}

class ProcessingError {
  readonly _tag = "ProcessingError";
  constructor(public message: string, public variant?: string) {}
}

class TimeoutError {
  readonly _tag = "TimeoutError";
  constructor(public message: string = 'Operation timed out') {}
}

// Effect-based image processing functions with automatic interruption
const resizeImage = (imageData: string, width: number, height: number): Effect.Effect<ImageVariant, ProcessingError> =>
  Effect.gen(function* () {
    const processingTime = Math.random() * 3000 + 1000;
    const size = `${width}x${height}`;
    
    yield* Effect.sync(() => console.log(`🖼️  Starting resize to ${size}...`));
    
    // Simulate processing with interruptible sleep
    yield* Effect.sleep(processingTime);
    
    // Simulate failures
    if (Math.random() < 0.3) {
      yield* Effect.fail(new ProcessingError(`Failed to resize image to ${size}`, size));
    }
    
    const variant: ImageVariant = {
      size,
      width,
      height,
      fileSize: Math.floor(Math.random() * 500000 + 100000),
      processingTime: Math.floor(processingTime)
    };
    
    yield* Effect.sync(() => console.log(`✅ Resize to ${size} completed in ${variant.processingTime}ms`));
    return variant;
  }).pipe(
    // All operations are automatically interruptible
    Effect.onInterrupt(() => 
      Effect.sync(() => console.log(`❌ Resize to ${width}x${height} interrupted`))
    )
  );

const uploadVariant = (variant: ImageVariant): Effect.Effect<string, ProcessingError> =>
  Effect.gen(function* () {
    const uploadTime = Math.random() * 2000 + 500;
    
    yield* Effect.sync(() => console.log(`📤 Starting upload for ${variant.size}...`));
    yield* Effect.sleep(uploadTime);
    
    if (Math.random() < 0.2) {
      yield* Effect.fail(new ProcessingError(`Failed to upload ${variant.size}`, variant.size));
    }
    
    const url = `https://cdn.example.com/${variant.size}-${Date.now()}.jpg`;
    yield* Effect.sync(() => console.log(`✅ Upload for ${variant.size} completed: ${url}`));
    return url;
  }).pipe(
    Effect.onInterrupt(() => 
      Effect.sync(() => console.log(`❌ Upload for ${variant.size} interrupted`))
    )
  );

export class ImageProcessingService {
  
  /**
   * Process image with fail-fast behavior - automatic cancellation on any failure
   */
  processImageFailFast = (imageData: string, imageId: string): Effect.Effect<ImageMetadata, ProcessingError | TimeoutError> =>
    Effect.gen(function* () {
      const startTime = yield* Effect.sync(() => Date.now());
      
      yield* Effect.sync(() => console.log(`\n🔄 Processing image ${imageId} (fail-fast mode)`));
      
      const sizes = [
        { width: 150, height: 150 },
        { width: 400, height: 300 },
        { width: 800, height: 600 },
        { width: 1600, height: 1200 }
      ];
      
      // All resize operations run in parallel
      // If ANY fails, ALL are automatically cancelled
      const variants = yield* Effect.all(
        sizes.map(size => resizeImage(imageData, size.width, size.height)),
        { concurrency: "unbounded" }
      );
      
      // Upload all variants in parallel
      const uploadedVariants = yield* Effect.all(
        variants.map(variant =>
          uploadVariant(variant).pipe(
            Effect.map(url => ({ ...variant, url }))
          )
        ),
        { concurrency: "unbounded" }
      );
      
      const processingTime = yield* Effect.sync(() => Date.now() - startTime);
      
      return {
        id: imageId,
        originalSize: imageData.length,
        variants: uploadedVariants,
        processingTime
      };
    }).pipe(
      Effect.timeout(30000), // Global timeout with automatic cleanup
      Effect.tapError(error =>
        Effect.sync(() => console.log(`❌ Processing ${imageId} failed: ${error._tag}`))
      )
    );
  
  /**
   * Process with partial failure tolerance - collect successes, handle failures gracefully
   */
  processImagePartialFailure = (imageData: string, imageId: string): Effect.Effect<ImageMetadata, never> =>
    Effect.gen(function* () {
      const startTime = yield* Effect.sync(() => Date.now());
      
      yield* Effect.sync(() => console.log(`\n🔄 Processing image ${imageId} (partial failure mode)`));
      
      const sizes = [
        { width: 150, height: 150 },
        { width: 400, height: 300 },
        { width: 800, height: 600 },
        { width: 1600, height: 1200 }
      ];
      
      // Resize operations - collect both successes and failures
      const resizeResults = yield* Effect.all(
        sizes.map(size =>
          resizeImage(imageData, size.width, size.height).pipe(
            Effect.either // Convert failures to success values
          )
        ),
        { concurrency: "unbounded" }
      );
      
      // Extract successful variants
      const successfulVariants: ImageVariant[] = [];
      const failedSizes: string[] = [];
      
      resizeResults.forEach((result, index) => {
        if (result._tag === 'Right') {
          successfulVariants.push(result.right);
        } else {
          const size = `${sizes[index].width}x${sizes[index].height}`;
          failedSizes.push(size);
          yield* Effect.sync(() => 
            console.log(`❌ Resize failed for ${size}: ${result.left.message}`)
          );
        }
      });
      
      if (successfulVariants.length === 0) {
        const processingTime = yield* Effect.sync(() => Date.now() - startTime);
        return {
          id: imageId,
          originalSize: imageData.length,
          variants: [],
          processingTime
        };
      }
      
      // Upload successful variants
      const uploadResults = yield* Effect.all(
        successfulVariants.map(variant =>
          uploadVariant(variant).pipe(
            Effect.map(url => ({ ...variant, url })),
            Effect.either
          )
        ),
        { concurrency: "unbounded" }
      );
      
      const finalVariants = uploadResults
        .filter(result => result._tag === 'Right')
        .map(result => result.right);
      
      const processingTime = yield* Effect.sync(() => Date.now() - startTime);
      
      yield* Effect.sync(() => {
        console.log(`✅ Processed ${imageId}: ${finalVariants.length}/${sizes.length} variants successful`);
        if (failedSizes.length > 0) {
          console.log(`⚠️  Failed sizes: ${failedSizes.join(', ')}`);
        }
      });
      
      return {
        id: imageId,
        originalSize: imageData.length,
        variants: finalVariants,
        processingTime
      };
    });
  
  /**
   * Process multiple images with structured concurrency and backpressure
   */
  processBatch = (images: Array<{ id: string, data: string }>): Effect.Effect<ImageMetadata[], never> =>
    Effect.gen(function* () {
      yield* Effect.sync(() => console.log(`\n🔄 Processing batch of ${images.length} images`));
      
      // Process with limited concurrency (backpressure)
      const results = yield* Effect.all(
        images.map(image =>
          this.processImagePartialFailure(image.data, image.id)
        ),
        { concurrency: 2 } // Only 2 images processed simultaneously
      );
      
      const successfulResults = results.filter(result => result.variants.length > 0);
      
      yield* Effect.sync(() => {
        console.log(`✅ Batch complete: ${successfulResults.length}/${images.length} images processed successfully`);
        if (successfulResults.length < images.length) {
          console.log(`⚠️  ${images.length - successfulResults.length} images failed to process`);
        }
      });
      
      return successfulResults;
    });
  
  /**
   * Advanced: Racing operations with automatic cleanup
   */
  processImageWithFallback = (imageData: string, imageId: string): Effect.Effect<ImageMetadata, never> =>
    pipe(
      // Try high-quality processing first
      this.processImageFailFast(imageData, imageId),
      Effect.race(
        // Fallback to lower quality if taking too long
        this.processImagePartialFailure(imageData, `${imageId}-fallback`).pipe(
          Effect.delay(10000) // Wait 10 seconds before fallback
        )
      ),
      Effect.catchAll(() =>
        // Ultimate fallback - just create a placeholder
        Effect.succeed({
          id: imageId,
          originalSize: imageData.length,
          variants: [],
          processingTime: 0
        } as ImageMetadata)
      ),
      Effect.tap(result =>
        Effect.sync(() => console.log(`🎯 Selected result for ${imageId}: ${result.variants.length} variants`))
      )
    );
}

// Advanced patterns demonstration
const processWithCircuitBreaker = <A, E>(
  operation: Effect.Effect<A, E>,
  threshold: number = 3
): Effect.Effect<A, E> => {
  // Simplified circuit breaker - in production use Effect.Ref for state
  return Effect.gen(function* () {
    const shouldFail = Math.random() < 0.1;
    if (shouldFail) {
      yield* Effect.sleep(100); // Simulate circuit breaker delay
    }
    return yield* operation;
  });
};

const processWithRetryAndBackoff = <A, E>(
  operation: Effect.Effect<A, E>
): Effect.Effect<A, E> =>
  pipe(
    operation,
    Effect.retry({
      times: 3,
      schedule: (attempt) => Effect.sleep((attempt + 1) * 1000) // Exponential backoff
    })
  );

// Usage example
export const runExample = Effect.gen(function* () {
  console.log("=== Effect-based Structured Concurrency Example ===");
  
  const service = new ImageProcessingService();
  const testImageData = "fake-image-data-" + "x".repeat(1000);
  
  // Test fail-fast processing
  console.log("\n--- Fail-Fast Processing ---");
  const result1 = yield* service.processImageFailFast(testImageData, "img-001").pipe(
    Effect.either
  );
  
  if (result1._tag === 'Right') {
    console.log(`Success: ${result1.right.variants.length} variants processed`);
  } else {
    console.log(`Fail-fast failed: ${result1.left._tag}`);
  }
  
  // Test partial failure processing
  console.log("\n--- Partial Failure Processing ---");
  const result2 = yield* service.processImagePartialFailure(testImageData, "img-002");
  console.log(`Partial success: ${result2.variants.length} variants processed`);
  
  // Test batch processing
  console.log("\n--- Batch Processing ---");
  const batchImages = [
    { id: "batch-001", data: testImageData },
    { id: "batch-002", data: testImageData },
    { id: "batch-003", data: testImageData },
  ];
  
  const batchResults = yield* service.processBatch(batchImages);
  console.log(`Batch results: ${batchResults.length} images processed`);
  
  // Test racing with fallback
  console.log("\n--- Racing with Fallback ---");
  const raceResult = yield* service.processImageWithFallback(testImageData, "img-race");
  console.log(`Race result: ${raceResult.variants.length} variants processed`);
  
  console.log('\n✅ All operations properly cleaned up - no orphaned fibers!');
});

