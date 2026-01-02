# Effect TS Demo - Image Processing Service

This demo showcases a Node.js image processing service that's intentionally written **without Effect TS** to demonstrate the problems that Effect TS solves.

## What This Service Does

A REST API for processing images through a multi-stage pipeline:
- Upload images and process them into multiple sizes
- Resize (thumbnail, small, medium, large, original)
- Optimize images for web
- Store to local files, S3, and CDN
- Save metadata to database
- Built-in error injection for demonstrating failures

**Pipeline**: Upload → Validate → Resize (4 sizes) → Optimize → File Storage → S3 → CDN → DB

## Running the Demo

```bash
npm install
npm start
```

The server will start on `http://localhost:3000`.

> This project uses Node.js v24+ native TypeScript support to run TypeScript directly without a build step or external tools.
> Use `nvm use` to switch to the correct Node version (specified in `.nvmrc`).

## API Endpoints

```bash
# Upload and process an image (with base64 encoding for demo)
curl -X POST http://localhost:3000/api/images \
  -H "Content-Type: application/json" \
  -d '{
    "file": "'$(base64 -w 0 image.jpg)'",
    "originalName": "vacation.jpg",
    "mimeType": "image/jpeg",
    "userId": "user123",
    "tags": ["vacation", "2024"]
  }'

# Get image metadata
curl http://localhost:3000/api/images/{id}

# List all images
curl http://localhost:3000/api/images

# Delete image
curl -X DELETE http://localhost:3000/api/images/{id}
```

## Error Injection System

The demo includes built-in error injection via query parameters to demonstrate failure scenarios:

```bash
# Trigger validation error
curl -X POST "http://localhost:3000/api/images?fail=validation" ...

# Fail during resize (all sizes)
curl -X POST "http://localhost:3000/api/images?fail=resize" ...

# Partial resize failure (2/4 sizes fail) - demonstrates Promise.allSettled complexity
curl -X POST "http://localhost:3000/api/images?fail=resize-partial" ...

# Fail S3 upload - demonstrates rollback complexity
curl -X POST "http://localhost:3000/api/images?fail=s3" ...

# Fail CDN publish - demonstrates partial success cleanup
curl -X POST "http://localhost:3000/api/images?fail=cdn" ...

# Multiple failures
curl -X POST "http://localhost:3000/api/images?fail=storage,cdn" ...

# Random failure rate (30% chance)
curl -X POST "http://localhost:3000/api/images?failureRate=0.3" ...
```

---

## 🔴 Pain Points This Demo Reveals

### 1. **Complex Error Handling**

**Location**: `src/services/image-service.ts:66-340`

**Problem**:
- 5+ levels of nested try-catch blocks
- Manual state tracking for rollback (fileStorageSaved, s3Uploaded, etc.)
- instanceof checks everywhere
- Errors lose context as they bubble up

```typescript
// Example from image-service.ts
let fileStorageSaved = false;
let s3Uploaded = false;
let cdnPublished = false;

try {
  await saveFile();
  fileStorageSaved = true;
  await uploadToS3();
  s3Uploaded = true;
  await publishToCDN();  // If this fails...
  cdnPublished = true;
} catch (error) {
  // MANUAL ROLLBACK - what if THIS fails?
  if (s3Uploaded) await deleteFromS3();
  if (fileStorageSaved) await deleteFile();
  throw error;
}
```

**Effect TS Solution**: Typed errors with `Effect.catchTag`, automatic resource cleanup with `Effect.acquireRelease`.

### 2. **Transaction Management Nightmare**

**Location**: `src/services/image-service.ts:135-250` (processImage method)

**Problem**:
- Operations span 4 systems: File Storage, S3, CDN, Database
- No transactional guarantees across systems
- Partial failures leave orphaned resources
- Rollback logic is 50+ lines and can itself fail
- If rollback fails, system is in inconsistent state

```typescript
// If CDN publish fails after S3 upload succeeds:
// - File is in S3 (costs money, takes space)
// - No CDN URL (users can't access it)
// - Metadata shows it exists (but it's broken)
// - Temp files might not be cleaned up
```

**Demo**: `POST /api/images?fail=cdn` - watch the rollback attempt in logs

**Effect TS Solution**: Composable resource management, STM for transactions, guaranteed cleanup.

### 3. **Duplicated Retry Logic**

**Location**:
- `src/storage/file-storage.ts:33-73`
- `src/storage/s3-storage.ts:36-76`
- `src/storage/cdn-publisher.ts:33-77`

**Problem**:
- Same retry pattern copied 3 times
- Hard-coded parameters (max retries, delays)
- Manual exponential backoff calculation
- No jitter, circuit breakers, or retry budgets
- Can't easily swap strategies

```typescript
// This pattern appears in 3 files:
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

**Demo**: Watch retry logs when running with `?failureRate=0.3`

**Effect TS Solution**: `Effect.retry` with `Schedule.exponential`, composable retry policies.

### 4. **Parallel Operations Complexity**

**Location**: `src/processing/image-processor.ts:46-93` (resizeToAllSizes)

**Problem**:
- Need to resize 4 sizes in parallel for performance
- Promise.allSettled gives results, but interpretation is manual
- Partial success handling is complex (2/4 succeed - now what?)
- Need to clean up successful results if overall operation fails

```typescript
const results = await Promise.allSettled([...resize operations...]);

// Now manually check each result
for (let i = 0; i < results.length; i++) {
  if (results[i].status === 'fulfilled') {
    succeeded.push(results[i].value);
  } else {
    failed.push(results[i].reason);
  }
}

// What do we do with partial success?
if (failed.length > 0) {
  // Clean up the ones that succeeded!
  await cleanup(succeeded);
  throw new Error(...);
}
```

**Demo**: `POST /api/images?fail=resize-partial` - 2/4 sizes fail

**Effect TS Solution**: `Effect.all` with different modes (validate, either), built-in error collection.

### 5. **Resource Leaks**

**Location**: `src/processing/image-processor.ts`

**Problem**:
- Temp files created during processing
- If errors occur, cleanup might not happen
- No compile-time guarantee of cleanup
- Cleanup itself can fail (what then?)

**Demo**:
```bash
# Upload with CDN failure 5 times
for i in {1..5}; do
  curl -X POST "http://localhost:3000/api/images?fail=cdn" -d '...'
done

# Check temp files
ls -la data/temp  # Orphaned files!
```

**Effect TS Solution**: `Effect.acquireRelease` guarantees cleanup even on errors.

### 6. **Non-composable Code**

**Problem**: Want to add logging? Metrics? Tracing? Timeouts? Circuit breakers?

Must modify every function manually. No way to compose cross-cutting concerns.

```typescript
// Adding timeout requires modifying every async operation:
const result = await Promise.race([
  operation(),
  timeout(5000)
]);
```

**Effect TS Solution**: `Effect.timeout`, `Effect.tap`, `Effect.withSpan` - compose at use site.

### 7. **Hard-coded Dependencies**

**Location**: `src/index.ts:30-42`

**Problem**:
- Manual dependency wiring
- Initialization order matters (implicit, not explicit)
- Testing requires mocking every dependency
- Can't easily swap implementations

```typescript
// Hard-coded dependency tree
const processor = new ImageProcessor();
const storage = new FileStorage();
const s3 = new S3Storage();
const cdn = new CDNPublisher();
const db = new MetadataStorage();
const service = new ImageService(processor, storage, s3, cdn, db);
```

**Effect TS Solution**: `Layer` system with automatic dependency injection.

### 8. **Validation Boilerplate**

**Location**: `src/validation.ts` (150+ lines)

**Problem**:
- Manual null checks, type checks, range checks
- Repetitive error messages
- No automatic type inference
- Hard to compose validators

**Effect TS Solution**: `@effect/schema` - declarative validation with automatic types.

---

## Project Structure

```
src/
├── index.ts                      # App entry point (manual DI)
├── types.ts                      # Domain types + error classes
├── validation.ts                 # Manual validation (150+ lines!)
├── api/
│   └── routes.ts                 # Express routes + error injection
├── services/
│   └── image-service.ts          # Main pipeline orchestration (300+ lines!)
├── processing/
│   └── image-processor.ts        # Resize + optimize logic
└── storage/
    ├── file-storage.ts           # Local file operations
    ├── s3-storage.ts             # S3 simulation
    ├── cdn-publisher.ts          # CDN simulation
    └── metadata-storage.ts       # Database simulation
```

---

## For Presentation

See `PRESENTATION.md` for the complete presentation plan including:
- Step-by-step demonstration script
- Error injection scenarios
- Live refactoring guide to Effect TS
- Talking points for each pain point
- Before/after code comparisons

---

## Key Statistics

- **Error handling code**: ~40% of codebase
- **Retry logic duplication**: 3 copies
- **Manual state tracking**: 7 boolean flags
- **Try-catch blocks**: 20+
- **Lines of validation**: 150+
- **Rollback logic**: 80 lines (can itself fail!)

---

## Next Steps

This vanilla implementation serves as the "before" state. The next phase will:
1. Refactor to Effect TS (live during presentation)
2. Show side-by-side comparisons
3. Demonstrate Effect's solutions to each pain point
4. Add real AWS integration (optional)

---

## Key Takeaways

1. **Error handling complexity** grows exponentially with system complexity
2. **Distributed transactions** are extremely difficult without proper abstractions
3. **Retry logic** is easy to get wrong and hard to maintain
4. **Resource safety** requires discipline (and is easy to mess up)
5. **Type safety alone** doesn't help with effects

**Effect TS provides**: Typed errors, composable operations, automatic resource management, declarative retries, dependency injection, and much more.
