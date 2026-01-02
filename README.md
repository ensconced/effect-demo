# Effect TS Demo - Document Management Service

This demo showcases a simple Node.js service that manages documents with metadata and content storage. It's intentionally written **without Effect TS** to demonstrate the problems that Effect TS solves.

## What This Service Does

A REST API for managing documents:
- Create documents with title, content, author, and tags
- Retrieve, update, and delete documents
- List and search documents by tags
- Simulates AWS services (S3 for content, DynamoDB for metadata)

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
# Create a document
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Document",
    "content": "Document content here",
    "author": "John Doe",
    "tags": ["demo", "typescript"]
  }'

# Get a document
curl http://localhost:3000/api/documents/{id}

# List all documents
curl http://localhost:3000/api/documents

# Search by tag
curl http://localhost:3000/api/documents?tag=demo

# Update a document
curl -X PUT http://localhost:3000/api/documents/{id} \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title"}'

# Delete a document
curl -X DELETE http://localhost:3000/api/documents/{id}
```

---

## 🔴 Pain Points This Demo Reveals

### 1. **Complex Error Handling**

**Location**: `src/services/document-service.ts`, `src/storage/file-storage.ts`

**Problem**:
- Error handling is scattered across try-catch blocks
- Different error types require different handling strategies
- No composable way to handle errors
- instanceof checks everywhere

```typescript
// Example from document-service.ts
try {
  await this.fileStorage.saveFile(id, validatedInput.content);
  fileSaved = true;
  await this.metadataStorage.save(metadata);
  metadataSaved = true;
  return {...};
} catch (error) {
  // Manual rollback logic
  if (fileSaved && !metadataSaved) {
    try {
      await this.fileStorage.deleteFile(id);
    } catch (rollbackError) {
      // What do we do here?
    }
  }
  throw error;
}
```

**Effect TS Solution**: Effect provides typed errors as first-class citizens with composable error handling using `Effect.catchTag`, `Effect.catchAll`, etc.

### 2. **Difficult Transaction Management**

**Location**: `src/services/document-service.ts:46-85` (createDocument), `src/services/document-service.ts:115-161` (updateDocument)

**Problem**:
- Operations span multiple storage systems (files + metadata)
- Partial failures leave the system in inconsistent state
- Manual rollback logic is complex and error-prone
- Rollbacks themselves can fail!

```typescript
// If metadata save fails after file save succeeds:
let fileSaved = false;
try {
  await this.fileStorage.saveFile(id, content);
  fileSaved = true;
  await this.metadataStorage.save(metadata); // What if this fails?
} catch (error) {
  if (fileSaved) {
    // Try to rollback, but what if THIS fails?
    await this.fileStorage.deleteFile(id);
  }
}
```

**Effect TS Solution**: Effect's resource management with `Effect.acquireRelease` and STM (Software Transactional Memory) for composable transactions.

### 3. **Non-composable Retry Logic**

**Location**: `src/storage/file-storage.ts:30-61`, `src/storage/file-storage.ts:68-102`

**Problem**:
- Retry logic is duplicated in multiple places
- Hard-coded retry parameters (max attempts, delays)
- Exponential backoff implemented manually
- Can't easily change retry strategy

```typescript
// Duplicated in saveFile and readFile
for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
  try {
    // operation
    return;
  } catch (error) {
    const delay = this.retryDelayMs * Math.pow(2, attempt);
    await this.sleep(delay);
  }
}
```

**Effect TS Solution**: `Effect.retry` with composable retry policies like `Schedule.exponential`, `Schedule.spaced`, etc.

### 4. **Hard-coded Dependencies**

**Location**: `src/index.ts:18-21`, `src/services/document-service.ts:26-30`

**Problem**:
- Dependencies are manually wired in constructor
- Difficult to test (need to mock every dependency)
- No dependency injection framework
- Initialization order must be managed manually

```typescript
// Manual dependency wiring
const fileStorage = new FileStorage('./data/files');
const metadataStorage = new MetadataStorage('./data/metadata.json');
const documentService = new DocumentService(fileStorage, metadataStorage);
```

**Effect TS Solution**: Effect's `Layer` system provides dependency injection with type-safe requirements and automatic initialization.

### 5. **Validation Boilerplate**

**Location**: `src/validation.ts`

**Problem**:
- 100+ lines of manual validation code
- Repetitive null/undefined checks
- Manual type narrowing
- Error messages must be manually maintained

```typescript
if (!input.title || typeof input.title !== 'string') {
  throw new ValidationError('Title is required and must be a string', 'title');
}
if (input.title.trim().length === 0) {
  throw new ValidationError('Title cannot be empty', 'title');
}
// ... repeat for every field
```

**Effect TS Solution**: `@effect/schema` provides declarative validation with automatic type inference and error messages.

### 6. **Imperative State Management**

**Location**: `src/storage/metadata-storage.ts`

**Problem**:
- Manual state tracking (`initialized` flag)
- Must remember to call `initialize()` before use
- No compile-time guarantees about initialization
- Mutable state (`Map`) requires careful management

```typescript
private initialized: boolean = false;

private ensureInitialized(): void {
  if (!this.initialized) {
    throw new Error('Not initialized');
  }
}
```

**Effect TS Solution**: Effect encourages functional patterns and provides `Ref` for managed state.

### 7. **Poor Composability**

**Problem**: Operations can't be easily combined, transformed, or reused.

```typescript
// Want to add logging? Need to modify every function
// Want to add metrics? Need to modify every function
// Want to add tracing? Need to modify every function
```

**Effect TS Solution**: Effect's functional composition allows adding cross-cutting concerns without modifying code.

### 8. **No Type-safe Resource Management**

**Location**: Throughout the codebase

**Problem**:
- File handles, connections must be manually closed
- Easy to leak resources
- No compile-time guarantees about cleanup

**Effect TS Solution**: `Effect.acquireRelease` ensures resources are properly cleaned up even when errors occur.

### 9. **Testing Difficulties**

**Problem**:
- Hard to test error cases
- Need to mock multiple dependencies
- No easy way to test retry logic
- Difficult to test partial failure scenarios

**Effect TS Solution**: Effect's testable runtime allows deterministic testing of complex scenarios.

---

## 🟢 How Effect TS Would Improve This

Here's a preview of what the same service would look like with Effect TS:

```typescript
// Declarative validation with Schema
const CreateDocumentSchema = Schema.struct({
  title: Schema.string.pipe(Schema.nonEmpty(), Schema.maxLength(200)),
  content: Schema.string.pipe(Schema.nonEmpty()),
  author: Schema.string.pipe(Schema.nonEmpty()),
  tags: Schema.array(Schema.string).pipe(Schema.optional)
});

// Composable retry logic
const withRetry = Effect.retry(Schedule.exponential("100 millis").pipe(
  Schedule.compose(Schedule.recurs(3))
));

// Type-safe dependency injection
class DocumentService extends Effect.Service<DocumentService>()("DocumentService", {
  effect: Effect.gen(function* (_) {
    const fileStorage = yield* _(FileStorage);
    const metadataStorage = yield* _(MetadataStorage);

    return {
      createDocument: (input) => Effect.gen(function* (_) {
        const validated = yield* _(Schema.decode(CreateDocumentSchema)(input));
        // Automatic transaction management, typed errors, composable operations
      })
    };
  })
}) {}

// Resource management
const useFileStorage = Effect.acquireRelease(
  openFile(path),
  (file) => closeFile(file)
);
```

---

## Project Structure

```
src/
├── index.ts              # Application entry point
├── types.ts              # Domain types and error classes
├── validation.ts         # Manual validation logic (100+ lines!)
├── api/
│   └── routes.ts         # Express routes with error handling
├── services/
│   └── document-service.ts   # Business logic with complex error handling
└── storage/
    ├── file-storage.ts       # File operations with retry logic
    └── metadata-storage.ts   # Metadata persistence
```

## Next Steps

After reviewing these pain points, the next phase will:
1. Refactor this service using Effect TS
2. Show side-by-side comparisons
3. Demonstrate Effect's solutions to each pain point
4. Add AWS integration (real DynamoDB and S3)

---

## Key Takeaways for Your Presentation

1. **Error handling complexity grows exponentially** with system complexity
2. **Transaction management** across multiple systems is extremely difficult without proper abstractions
3. **Retry logic** is repetitive and easy to get wrong
4. **Testing** complex async code with errors is painful
5. **Type safety** doesn't help with effects (errors, async, dependencies)

Effect TS provides a **functional programming foundation** that makes all of these problems manageable through:
- Typed errors as first-class values
- Composable operations
- Declarative dependency injection
- Built-in retry/timeout/circuit breaker patterns
- Resource-safe programming
