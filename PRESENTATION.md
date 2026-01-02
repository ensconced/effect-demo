# Effect TS Presentation Plan

## Overview
This presentation demonstrates the problems with traditional TypeScript async/error handling by using a realistic image processing pipeline, then shows how Effect TS solves each problem.

**Duration:** 30-45 minutes
**Format:** Live demo with real errors, then live refactoring to Effect TS

---

## Demo Architecture

### Image Processing Pipeline
```
Upload → Validate → Resize (4 sizes) → Optimize → Store S3 → Publish CDN → Save Metadata
```

Each stage has different failure modes that we'll trigger live.

---

## Part 1: The Problems (15-20 min)

### Setup: Error Injection System

The demo includes **error injection via query parameters** to trigger specific failures:

```bash
# Trigger storage failure
POST /api/images?fail=storage

# Trigger CDN timeout
POST /api/images?fail=cdn

# Trigger partial resize failure (2/4 sizes fail)
POST /api/images?fail=resize-partial

# Trigger validation error
POST /api/images (with invalid file)

# Trigger multiple simultaneous failures
POST /api/images?fail=storage,cdn
```

### Demo 1: Complex Error Handling (5 min)

**Problem:** Nested try-catch blocks, instanceof checks everywhere

**Live Demo:**
1. Upload an image successfully (happy path)
2. Show the code with nested try-catch blocks
3. Trigger a validation error: `POST /api/images` with oversized image
4. Show how the error bubbles through multiple layers
5. Point out: 3-4 levels of try-catch, manual error type checking

**Code to highlight:** `src/services/image-service.ts` - the `processImage()` method

**Talking points:**
- "Notice how every async operation needs its own try-catch"
- "We're using instanceof to figure out what went wrong"
- "What if we forget to catch an error at some layer?"

---

### Demo 2: Transaction Management / Partial Failures (5 min)

**Problem:** Operations span multiple systems (file system, S3, CDN, DB). Partial failures leave orphaned resources.

**Live Demo:**
1. Upload an image with: `POST /api/images?fail=cdn`
2. Show the result: Image is in S3 and file system, but not on CDN
3. Show the rollback logic in code - it's complex and error-prone
4. Upload again with: `POST /api/images?fail=storage,cdn`
5. Show that rollback can fail too!

**Code to highlight:** `src/services/image-service.ts` - rollback logic in `processImage()`

```typescript
// Highlight this pattern
let fileStored = false;
let s3Stored = false;
try {
  await storeFile();
  fileStored = true;
  await storeS3();
  s3Stored = true;
  await publishCDN(); // Fails!
} catch (error) {
  // Manual rollback - what if THIS fails?
  if (s3Stored) await deleteFromS3();
  if (fileStored) await deleteFile();
}
```

**Talking points:**
- "We have 4 storage systems: local files, S3, CDN, database"
- "If step 3 fails, we need to manually undo steps 1 and 2"
- "What if the rollback itself fails? We have orphaned data"
- "No transactional guarantees across these systems"

---

### Demo 3: Non-Composable Retry Logic (5 min)

**Problem:** Retry logic duplicated, hard-coded parameters, can't easily change strategy

**Live Demo:**
1. Show CDN publish with simulated intermittent failures
2. Upload image - watch retry attempts in logs
3. Show the code - manual retry loop with exponential backoff
4. Point out it's duplicated in multiple places

**Code to highlight:** `src/storage/cdn-publisher.ts` and `src/storage/s3-storage.ts`

```typescript
// Show this duplicated pattern
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  try {
    await operation();
    return;
  } catch (error) {
    const delay = baseDelay * Math.pow(2, attempt);
    await sleep(delay);
  }
}
```

**Talking points:**
- "This retry logic appears in 3 different files"
- "The parameters are hard-coded (3 retries, 100ms base delay)"
- "CDN publish should retry, but image resize shouldn't"
- "How do we add jitter? Circuit breakers? Retry budgets?"

---

### Demo 4: Resource Leaks (3 min)

**Problem:** Temp files created during processing aren't cleaned up on errors

**Live Demo:**
1. Upload multiple images with failures: `POST /api/images?fail=cdn` (x5)
2. Check the temp directory: `ls -la data/temp`
3. Show orphaned files from failed uploads

**Code to highlight:** No proper cleanup mechanism

**Talking points:**
- "Each upload creates 4 temp files for resized versions"
- "When CDN publish fails, those temp files never get cleaned up"
- "Over time, we fill up disk space"
- "No compile-time guarantee that cleanup happens"

---

### Demo 5: Parallel Operations Gone Wrong (3 min)

**Problem:** Resizing 4 image sizes in parallel, handling partial failures is messy

**Live Demo:**
1. Upload with: `POST /api/images?fail=resize-partial`
2. Show logs: 2 sizes succeed, 2 fail
3. What do we do? Fail the whole upload? Use what succeeded?

**Code to highlight:** `src/processing/image-processor.ts` - parallel resize logic

```typescript
const results = await Promise.allSettled([
  resize('thumbnail'),
  resize('small'),
  resize('medium'),
  resize('large')
]);

// Now what? Check each result? How do we handle partial success?
const succeeded = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');

if (failed.length > 0) {
  // Clean up the ones that succeeded? Fail the whole thing?
  // This is messy!
}
```

**Talking points:**
- "We need all 4 sizes, but they can be generated in parallel"
- "If 1 fails, do we throw away the 3 that worked?"
- "Promise.allSettled gives us the results, but we still need to interpret them"
- "What about cleanup of partial results?"

---

## Part 2: The Solution - Effect TS (20-25 min)

### Refactoring Strategy

We'll refactor the code **live** during the presentation, showing side-by-side comparisons.

---

### Refactor 1: Typed Errors (5 min)

**From:**
```typescript
try {
  await validateImage(file);
} catch (error) {
  if (error instanceof ValidationError) {
    // handle validation
  } else if (error instanceof StorageError) {
    // handle storage
  }
}
```

**To:**
```typescript
import { Effect } from "effect";

const validateImage = (file: File): Effect.Effect<
  ImageMetadata,
  ValidationError | StorageError
> => {
  // Errors are now in the type signature!
};

// Handle specific errors
const program = validateImage(file).pipe(
  Effect.catchTag("ValidationError", (error) => {
    // TypeScript knows this is ValidationError
  }),
  Effect.catchTag("StorageError", (error) => {
    // TypeScript knows this is StorageError
  })
);
```

**Talking points:**
- "Errors are now part of the type system"
- "The compiler tells us all possible errors"
- "Can't forget to handle an error case"

---

### Refactor 2: Resource Management (5 min)

**From:**
```typescript
const tempFile = await createTempFile();
try {
  await processImage(tempFile);
} finally {
  await deleteTempFile(tempFile); // Might forget this!
}
```

**To:**
```typescript
const program = Effect.acquireRelease(
  createTempFile,
  (tempFile) => deleteTempFile(tempFile) // ALWAYS runs
).pipe(
  Effect.flatMap(processImage)
);
```

**Live demo:**
- Upload with failure, show temp files are cleaned up
- Show logs proving cleanup ran even on error

**Talking points:**
- "acquireRelease guarantees cleanup"
- "Even if processImage fails, cleanup runs"
- "Composable - can nest resources"

---

### Refactor 3: Composable Retry (5 min)

**From:** 100 lines of manual retry code

**To:**
```typescript
import { Schedule } from "effect";

const publishToCDN = (url: string) => /* ... */;

const withRetry = publishToCDN(url).pipe(
  Effect.retry(
    Schedule.exponential("100 millis").pipe(
      Schedule.union(Schedule.recurs(3)),
      Schedule.jittered
    )
  )
);
```

**Live demo:**
- Upload image, show retry happening with jitter
- Change retry strategy in real-time (demo composability)

**Talking points:**
- "Retry logic is now declarative"
- "Easy to compose strategies: exponential + max retries + jitter"
- "Can add circuit breakers, retry budgets, etc."

---

### Refactor 4: Safe Parallel Operations (5 min)

**From:** Promise.allSettled mess

**To:**
```typescript
const resizeAll = Effect.all([
  resize('thumbnail'),
  resize('small'),
  resize('medium'),
  resize('large')
], { concurrency: 4 });

// Or fail fast:
const resizeAllOrFail = Effect.all([...], { mode: "either" });

// Or collect errors:
const resizeAllValidate = Effect.all([...], { mode: "validate" });
```

**Live demo:**
- Show all 4 sizes being processed
- Trigger partial failure, show how Effect handles it

---

### Refactor 5: Transaction-like Behavior (5 min)

**From:** Manual rollback logic

**To:**
```typescript
const processImage = Effect.gen(function* (_) {
  // All operations in a transaction-like scope
  const file = yield* _(storeFile);
  const s3 = yield* _(storeToS3);
  const cdn = yield* _(publishToCDN);
  const metadata = yield* _(saveMetadata);

  return { file, s3, cdn, metadata };
}).pipe(
  // Automatic compensation on failure
  Effect.onError(() =>
    Effect.all([
      deleteFromCDN,
      deleteFromS3,
      deleteFile
    ])
  )
);
```

**Live demo:**
- Trigger CDN failure
- Show automatic rollback in logs
- No orphaned data!

---

## Part 3: Additional Benefits (5 min)

### Dependency Injection with Layers

**Show:**
```typescript
class ImageProcessor extends Effect.Service<ImageProcessor>()("ImageProcessor", {
  dependencies: [S3Storage, CDNPublisher, MetadataDB],
  effect: Effect.gen(function* (_) {
    const s3 = yield* _(S3Storage);
    const cdn = yield* _(CDNPublisher);
    const db = yield* _(MetadataDB);

    return { process: (image) => /* ... */ };
  })
}) {}

// Swap implementations for testing!
const TestLayer = Layer.succeed(S3Storage, new MockS3());
```

### Observability Built-in

**Show:**
```typescript
const program = processImage(file).pipe(
  Effect.tap(() => Effect.log("Processing image")),
  Effect.withSpan("image-processing", { attributes: { imageId } })
);

// Automatic tracing, logging, metrics!
```

---

## Demo Error Injection Implementation

### Query Parameter System

```typescript
// In API routes
app.post('/api/images', (req, res) => {
  const failPoints = (req.query.fail as string)?.split(',') || [];

  const config: ProcessingConfig = {
    shouldFailStorage: failPoints.includes('storage'),
    shouldFailCDN: failPoints.includes('cdn'),
    shouldFailResize: failPoints.includes('resize-partial'),
  };

  await imageService.processImage(file, config);
});
```

### Environment Variables

```bash
# Control failure rates
export STORAGE_FAILURE_RATE=0.3  # 30% chance of failure
export CDN_TIMEOUT_MS=1000       # Timeout after 1 second
export ENABLE_RETRY_LOGGING=true # Verbose retry logs
```

---

## Presentation Flow Summary

1. **Introduction** (2 min) - Explain the image processing pipeline
2. **Demo Problems** (15-20 min) - Show 5 key pain points with live errors
3. **Introduce Effect TS** (2 min) - Quick overview of Effect
4. **Live Refactoring** (20-25 min) - Refactor each problem area
5. **Results** (3 min) - Side-by-side comparison, upload with no errors
6. **Q&A** (5-10 min)

---

## Preparation Checklist

- [ ] Test all error injection scenarios
- [ ] Prepare before/after code snippets
- [ ] Set up split-screen: vanilla code left, Effect code right
- [ ] Have logs visible during demos
- [ ] Pre-seed some test images for uploads
- [ ] Test internet/API connectivity
- [ ] Have `data/temp` directory visible to show cleanup

---

## Key Takeaways for Audience

1. **Type Safety for Effects** - Errors, dependencies, and resources in the type system
2. **Composability** - Retry, timeout, circuit breaker, etc. all compose
3. **Resource Safety** - Guaranteed cleanup
4. **Testability** - Easy to swap implementations
5. **Observability** - Built-in logging, tracing, metrics

---

## Backup Demos (if time allows)

- **Schema Validation** - Show @effect/schema replacing manual validation
- **Concurrency Control** - Limit parallel uploads with Effect.withConcurrency
- **Streaming** - Process large images in chunks with Effect.Stream
