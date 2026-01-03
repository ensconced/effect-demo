/**
 * Traditional Resource Management - File Processing Service
 * 
 * Problems demonstrated:
 * - Manual resource cleanup with finally blocks
 * - Resource leaks when cleanup fails
 * - Complex nested resource acquisition
 * - No automatic rollback on failures
 * - Hard to track what resources are open
 * - Cleanup order dependencies
 */

import * as fs from 'fs/promises';
import * as path from 'path';

interface FileHandle {
  path: string;
  fd: number;
  close(): Promise<void>;
}

interface DatabaseConnection {
  id: string;
  isConnected: boolean;
  query(sql: string): Promise<any>;
  close(): Promise<void>;
}

interface HttpConnection {
  url: string;
  isOpen: boolean;
  post(data: any): Promise<any>;
  close(): Promise<void>;
}

// Simulated resource implementations
class MockFileHandle implements FileHandle {
  constructor(public path: string, public fd: number) {}
  
  async close(): Promise<void> {
    if (Math.random() < 0.1) {
      throw new Error(`Failed to close file ${this.path}`);
    }
    console.log(`📄 Closed file: ${this.path}`);
  }
}

class MockDatabaseConnection implements DatabaseConnection {
  constructor(public id: string, public isConnected: boolean = true) {}
  
  async query(sql: string): Promise<any> {
    if (!this.isConnected) throw new Error('Database not connected');
    if (Math.random() < 0.15) throw new Error('Database query failed');
    return { rows: [] };
  }
  
  async close(): Promise<void> {
    if (Math.random() < 0.1) {
      throw new Error(`Failed to close database connection ${this.id}`);
    }
    this.isConnected = false;
    console.log(`💾 Closed database connection: ${this.id}`);
  }
}

class MockHttpConnection implements HttpConnection {
  constructor(public url: string, public isOpen: boolean = true) {}
  
  async post(data: any): Promise<any> {
    if (!this.isOpen) throw new Error('HTTP connection closed');
    if (Math.random() < 0.2) throw new Error('HTTP request failed');
    return { status: 200, data: 'success' };
  }
  
  async close(): Promise<void> {
    if (Math.random() < 0.1) {
      throw new Error(`Failed to close HTTP connection to ${this.url}`);
    }
    this.isOpen = false;
    console.log(`🌐 Closed HTTP connection: ${this.url}`);
  }
}

// Resource acquisition functions
async function openFile(filePath: string): Promise<FileHandle> {
  if (Math.random() < 0.1) {
    throw new Error(`Failed to open file: ${filePath}`);
  }
  console.log(`📄 Opened file: ${filePath}`);
  return new MockFileHandle(filePath, Math.floor(Math.random() * 1000));
}

async function connectToDatabase(connectionString: string): Promise<DatabaseConnection> {
  if (Math.random() < 0.1) {
    throw new Error(`Failed to connect to database: ${connectionString}`);
  }
  console.log(`💾 Connected to database: ${connectionString}`);
  return new MockDatabaseConnection(connectionString);
}

async function openHttpConnection(url: string): Promise<HttpConnection> {
  if (Math.random() < 0.1) {
    throw new Error(`Failed to open HTTP connection: ${url}`);
  }
  console.log(`🌐 Opened HTTP connection: ${url}`);
  return new MockHttpConnection(url);
}

// Complex service that uses multiple resources
export class FileProcessingService {
  
  /**
   * Process a file by:
   * 1. Opening the file
   * 2. Connecting to database 
   * 3. Opening HTTP connection
   * 4. Processing data
   * 5. Cleanup in reverse order
   */
  async processFile(filePath: string): Promise<string> {
    let fileHandle: FileHandle | null = null;
    let dbConnection: DatabaseConnection | null = null;
    let httpConnection: HttpConnection | null = null;
    
    try {
      // Resource acquisition - if any fails, we need to cleanup what we have
      console.log(`\n🔄 Processing file: ${filePath}`);
      
      fileHandle = await openFile(filePath);
      
      try {
        dbConnection = await connectToDatabase('postgresql://localhost:5432/mydb');
        
        try {
          httpConnection = await openHttpConnection('https://api.example.com');
          
          // Actual work using all resources
          await dbConnection.query('SELECT * FROM files WHERE path = $1');
          await httpConnection.post({ file: filePath, processed: true });
          
          return `Successfully processed ${filePath}`;
          
        } catch (error) {
          console.error(`HTTP operation failed: ${error}`);
          throw error;
        } finally {
          // Cleanup HTTP connection
          if (httpConnection) {
            try {
              await httpConnection.close();
            } catch (cleanupError) {
              console.error(`Failed to cleanup HTTP connection: ${cleanupError}`);
              // What do we do here? Original error might be lost!
            }
          }
        }
        
      } catch (error) {
        console.error(`Database operation failed: ${error}`);
        throw error;
      } finally {
        // Cleanup database connection
        if (dbConnection) {
          try {
            await dbConnection.close();
          } catch (cleanupError) {
            console.error(`Failed to cleanup database connection: ${cleanupError}`);
            // Cleanup error might mask the original error
          }
        }
      }
      
    } catch (error) {
      console.error(`File operation failed: ${error}`);
      throw error;
    } finally {
      // Cleanup file handle
      if (fileHandle) {
        try {
          await fileHandle.close();
        } catch (cleanupError) {
          console.error(`Failed to cleanup file handle: ${cleanupError}`);
          // Resource leak! File handle might remain open
        }
      }
    }
  }
  
  /**
   * Batch process multiple files - even more complex cleanup
   */
  async processBatch(filePaths: string[]): Promise<string[]> {
    const results: string[] = [];
    const openResources: Array<FileHandle | DatabaseConnection | HttpConnection> = [];
    
    try {
      // Open database connection once for the batch
      const dbConnection = await connectToDatabase('postgresql://localhost:5432/batch');
      openResources.push(dbConnection);
      
      for (const filePath of filePaths) {
        let fileHandle: FileHandle | null = null;
        let httpConnection: HttpConnection | null = null;
        
        try {
          fileHandle = await openFile(filePath);
          openResources.push(fileHandle);
          
          httpConnection = await openHttpConnection('https://batch.api.example.com');
          openResources.push(httpConnection);
          
          // Process using shared database connection
          await dbConnection.query(`INSERT INTO processed_files (path) VALUES ('${filePath}')`);
          await httpConnection.post({ file: filePath });
          
          results.push(`Processed ${filePath}`);
          
        } catch (error) {
          console.error(`Failed to process ${filePath}: ${error}`);
          results.push(`Failed: ${filePath}`);
          // Continue with other files, but we might have resource leaks
        }
      }
      
      return results;
      
    } finally {
      // Try to cleanup all resources - order matters!
      // HTTP connections first, then files, then database
      const cleanupErrors: Error[] = [];
      
      for (const resource of openResources.reverse()) {
        try {
          await resource.close();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError as Error);
        }
      }
      
      if (cleanupErrors.length > 0) {
        console.error(`Cleanup failed for ${cleanupErrors.length} resources:`, cleanupErrors);
        // Resource leaks are likely at this point
      }
    }
  }
}

// Usage example
export async function runExample() {
  console.log("=== Traditional Resource Management Example ===");
  
  const service = new FileProcessingService();
  
  // Test single file processing
  try {
    const result = await service.processFile('/tmp/test1.txt');
    console.log(`✅ Single file: ${result}`);
  } catch (error) {
    console.log(`❌ Single file: ${error instanceof Error ? error.message : error}`);
  }
  
  // Test batch processing
  console.log('\n--- Batch Processing ---');
  try {
    const results = await service.processBatch([
      '/tmp/batch1.txt',
      '/tmp/batch2.txt', 
      '/tmp/batch3.txt'
    ]);
    console.log(`✅ Batch results:`, results);
  } catch (error) {
    console.log(`❌ Batch processing: ${error instanceof Error ? error.message : error}`);
  }
  
  console.log('\n⚠️  Check for resource leaks - some resources might still be open!');
}

if (import.meta.main) {
  runExample();
}