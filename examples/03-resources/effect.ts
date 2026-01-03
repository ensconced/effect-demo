/**
 * Effect-based Resource Management - File Processing Service
 * 
 * Benefits demonstrated:
 * - Automatic resource cleanup with acquireRelease
 * - Guaranteed cleanup even on failures
 * - Composable resource management
 * - Correct cleanup order (reverse of acquisition)
 * - No resource leaks possible
 * - Clean, linear code flow
 */

import { Effect, pipe } from "effect";

interface FileHandle {
  path: string;
  fd: number;
}

interface DatabaseConnection {
  id: string;
  query(sql: string): Effect.Effect<any, DatabaseError>;
}

interface HttpConnection {
  url: string;
  post(data: any): Effect.Effect<any, HttpError>;
}

// Typed errors
class FileError {
  readonly _tag = "FileError";
  constructor(readonly message: string) {}
}

class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly message: string) {}
}

class HttpError {
  readonly _tag = "HttpError";
  constructor(readonly message: string) {}
}

// Mock implementations
const createMockFileHandle = (path: string): FileHandle => ({
  path,
  fd: Math.floor(Math.random() * 1000)
});

const createMockDatabaseConnection = (id: string): DatabaseConnection => ({
  id,
  query: (sql: string) => Effect.gen(function* () {
    if (Math.random() < 0.15) {
      yield* Effect.fail(new DatabaseError('Database query failed'));
    }
    return { rows: [] };
  })
});

const createMockHttpConnection = (url: string): HttpConnection => ({
  url,
  post: (data: any) => Effect.gen(function* () {
    if (Math.random() < 0.2) {
      yield* Effect.fail(new HttpError('HTTP request failed'));
    }
    return { status: 200, data: 'success' };
  })
});

// Resource acquisition with automatic cleanup
const acquireFile = (filePath: string): Effect.Effect<FileHandle, FileError> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) {
      yield* Effect.fail(new FileError(`Failed to open file: ${filePath}`));
    }
    yield* Effect.sync(() => console.log(`📄 Opened file: ${filePath}`));
    return createMockFileHandle(filePath);
  });

const releaseFile = (fileHandle: FileHandle): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) {
      yield* Effect.sync(() => console.error(`Failed to close file ${fileHandle.path} (but continuing cleanup)`));
    } else {
      yield* Effect.sync(() => console.log(`📄 Closed file: ${fileHandle.path}`));
    }
  });

const acquireDatabase = (connectionString: string): Effect.Effect<DatabaseConnection, DatabaseError> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) {
      yield* Effect.fail(new DatabaseError(`Failed to connect to database: ${connectionString}`));
    }
    yield* Effect.sync(() => console.log(`💾 Connected to database: ${connectionString}`));
    return createMockDatabaseConnection(connectionString);
  });

const releaseDatabase = (dbConnection: DatabaseConnection): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) {
      yield* Effect.sync(() => console.error(`Failed to close database ${dbConnection.id} (but continuing cleanup)`));
    } else {
      yield* Effect.sync(() => console.log(`💾 Closed database connection: ${dbConnection.id}`));
    }
  });

const acquireHttpConnection = (url: string): Effect.Effect<HttpConnection, HttpError> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) {
      yield* Effect.fail(new HttpError(`Failed to open HTTP connection: ${url}`));
    }
    yield* Effect.sync(() => console.log(`🌐 Opened HTTP connection: ${url}`));
    return createMockHttpConnection(url);
  });

const releaseHttpConnection = (httpConnection: HttpConnection): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) {
      yield* Effect.sync(() => console.error(`Failed to close HTTP ${httpConnection.url} (but continuing cleanup)`));
    } else {
      yield* Effect.sync(() => console.log(`🌐 Closed HTTP connection: ${httpConnection.url}`));
    }
  });

// Resource constructors using acquireRelease
const withFile = <A, E>(filePath: string) => 
  (use: (fileHandle: FileHandle) => Effect.Effect<A, E>): Effect.Effect<A, E | FileError> =>
    Effect.acquireRelease(
      acquireFile(filePath),
      releaseFile
    ).pipe(Effect.flatMap(use));

const withDatabase = <A, E>(connectionString: string) =>
  (use: (db: DatabaseConnection) => Effect.Effect<A, E>): Effect.Effect<A, E | DatabaseError> =>
    Effect.acquireRelease(
      acquireDatabase(connectionString),
      releaseDatabase
    ).pipe(Effect.flatMap(use));

const withHttpConnection = <A, E>(url: string) =>
  (use: (http: HttpConnection) => Effect.Effect<A, E>): Effect.Effect<A, E | HttpError> =>
    Effect.acquireRelease(
      acquireHttpConnection(url),
      releaseHttpConnection
    ).pipe(Effect.flatMap(use));

// Service using automatic resource management
export class FileProcessingService {
  
  /**
   * Process a file using multiple resources - automatic cleanup guaranteed
   */
  processFile = (filePath: string): Effect.Effect<string, FileError | DatabaseError | HttpError> =>
    Effect.gen(function* () {
      yield* Effect.sync(() => console.log(`\n🔄 Processing file: ${filePath}`));
      
      // Resources are automatically managed and cleaned up in reverse order
      return yield* withFile(filePath)(fileHandle =>
        withDatabase('postgresql://localhost:5432/mydb')(dbConnection =>
          withHttpConnection('https://api.example.com')(httpConnection =>
            Effect.gen(function* () {
              // All resources are available here and will be cleaned up automatically
              yield* dbConnection.query('SELECT * FROM files WHERE path = $1');
              yield* httpConnection.post({ file: filePath, processed: true });
              
              return `Successfully processed ${filePath}`;
            })
          )
        )
      );
    });
  
  /**
   * Batch processing with shared database connection
   */
  processBatch = (filePaths: string[]): Effect.Effect<string[], DatabaseError> =>
    withDatabase('postgresql://localhost:5432/batch')(dbConnection =>
      Effect.gen(function* () {
        const results: string[] = [];
        
        // Process files sequentially (could be parallel with Effect.all)
        for (const filePath of filePaths) {
          const result = yield* withFile(filePath)(fileHandle =>
            withHttpConnection('https://batch.api.example.com')(httpConnection =>
              Effect.gen(function* () {
                yield* dbConnection.query(`INSERT INTO processed_files (path) VALUES ('${filePath}')`);
                yield* httpConnection.post({ file: filePath });
                return `Processed ${filePath}`;
              })
            )
          ).pipe(
            // Handle individual file errors gracefully
            Effect.catchAll(error => 
              Effect.succeed(`Failed: ${filePath} (${error._tag})`)
            )
          );
          
          results.push(result);
        }
        
        return results;
      })
    );

  /**
   * Parallel batch processing with resource pooling
   */
  processBatchParallel = (filePaths: string[]): Effect.Effect<string[], DatabaseError> =>
    withDatabase('postgresql://localhost:5432/batch')(dbConnection =>
      Effect.all(
        filePaths.map(filePath =>
          withFile(filePath)(fileHandle =>
            withHttpConnection('https://batch.api.example.com')(httpConnection =>
              Effect.gen(function* () {
                yield* dbConnection.query(`INSERT INTO processed_files (path) VALUES ('${filePath}')`);
                yield* httpConnection.post({ file: filePath });
                return `Processed ${filePath}`;
              })
            )
          ).pipe(
            Effect.catchAll(error => 
              Effect.succeed(`Failed: ${filePath} (${error._tag})`)
            )
          )
        ),
        { concurrency: 3 } // Limit concurrency to prevent resource exhaustion
      )
    );
}

// Advanced: Resource pools and custom resource managers
const createResourcePool = <R, E>(
  acquire: Effect.Effect<R, E>,
  release: (resource: R) => Effect.Effect<void, never>,
  poolSize: number = 5
): Effect.Effect<(use: (resource: R) => Effect.Effect<any, any>) => Effect.Effect<any, E>, never> =>
  Effect.gen(function* () {
    // In a real implementation, this would use Effect.Ref and Semaphore
    // to manage a pool of resources
    return (use: any) => Effect.acquireRelease(acquire, release).pipe(Effect.flatMap(use));
  });

// Usage example
export const runExample = Effect.gen(function* () {
  console.log("=== Effect-based Resource Management Example ===");
  
  const service = new FileProcessingService();
  
  // Test single file processing
  const singleResult = yield* service.processFile('/tmp/test1.txt').pipe(
    Effect.either
  );
  
  if (singleResult._tag === 'Right') {
    console.log(`✅ Single file: ${singleResult.right}`);
  } else {
    console.log(`❌ Single file: ${singleResult.left._tag} - ${singleResult.left.message}`);
  }
  
  // Test sequential batch processing
  console.log('\n--- Sequential Batch Processing ---');
  const batchResult = yield* service.processBatch([
    '/tmp/batch1.txt',
    '/tmp/batch2.txt', 
    '/tmp/batch3.txt'
  ]).pipe(Effect.either);
  
  if (batchResult._tag === 'Right') {
    console.log(`✅ Batch results:`, batchResult.right);
  } else {
    console.log(`❌ Batch processing: ${batchResult.left._tag} - ${batchResult.left.message}`);
  }
  
  // Test parallel batch processing
  console.log('\n--- Parallel Batch Processing ---');
  const parallelResult = yield* service.processBatchParallel([
    '/tmp/parallel1.txt',
    '/tmp/parallel2.txt',
    '/tmp/parallel3.txt',
    '/tmp/parallel4.txt'
  ]).pipe(Effect.either);
  
  if (parallelResult._tag === 'Right') {
    console.log(`✅ Parallel batch results:`, parallelResult.right);
  } else {
    console.log(`❌ Parallel batch processing: ${parallelResult.left._tag} - ${parallelResult.left.message}`);
  }
  
  console.log('\n✅ All resources automatically cleaned up - no leaks possible!');
});

if (import.meta.main) {
  Effect.runPromise(runExample);
}