import { randomUUID } from 'crypto';
import { FileStorage } from '../storage/file-storage.ts';
import { MetadataStorage } from '../storage/metadata-storage.ts';
import {
  Document,
  DocumentMetadata,
  CreateDocumentInput,
  UpdateDocumentInput,
  StorageError,
  DatabaseError,
  NotFoundError,
} from '../types.ts';
import { validateCreateDocumentInput, validateUpdateDocumentInput, validateDocumentId } from '../validation.ts';

/**
 * Document Service - orchestrates file and metadata storage
 *
 * PAIN POINTS TO NOTICE:
 * 1. Complex error handling with nested try-catch blocks
 * 2. Manual cleanup in case of partial failures (rollback logic)
 * 3. No clear separation of concerns
 * 4. Hard-coded dependencies - difficult to test
 * 5. Difficult to compose operations
 * 6. Error types are checked with instanceof everywhere
 */
export class DocumentService {
  private fileStorage: FileStorage;
  private metadataStorage: MetadataStorage;

  constructor(fileStorage: FileStorage, metadataStorage: MetadataStorage) {
    this.fileStorage = fileStorage;
    this.metadataStorage = metadataStorage;
  }

  async initialize(): Promise<void> {
    // Notice: we need to handle initialization of multiple dependencies
    // What if one succeeds and the other fails? No transactional guarantees
    try {
      await this.fileStorage.initialize();
      await this.metadataStorage.initialize();
    } catch (error) {
      if (error instanceof StorageError) {
        throw new StorageError('Failed to initialize document service', error);
      } else if (error instanceof DatabaseError) {
        throw new DatabaseError('Failed to initialize document service', error);
      }
      throw error;
    }
  }

  /**
   * Create a new document
   * Notice the complex error handling and rollback logic
   */
  async createDocument(input: CreateDocumentInput): Promise<Document> {
    // Validate input (can throw ValidationError)
    const validatedInput = validateCreateDocumentInput(input);

    const id = randomUUID();
    const now = new Date();
    const size = Buffer.byteLength(validatedInput.content, 'utf-8');

    const metadata: DocumentMetadata = {
      id,
      title: validatedInput.title,
      author: validatedInput.author,
      tags: validatedInput.tags || [],
      createdAt: now,
      updatedAt: now,
      size,
    };

    // This is a "transaction" that spans two systems
    // If one succeeds and the other fails, we have inconsistent state!
    let fileSaved = false;
    let metadataSaved = false;

    try {
      // Save content to file storage
      await this.fileStorage.saveFile(id, validatedInput.content);
      fileSaved = true;

      // Save metadata to database
      await this.metadataStorage.save(metadata);
      metadataSaved = true;

      return {
        ...metadata,
        content: validatedInput.content,
      };
    } catch (error) {
      // ROLLBACK LOGIC - this is complex and error-prone!
      // What if the rollback itself fails?
      if (fileSaved && !metadataSaved) {
        try {
          await this.fileStorage.deleteFile(id);
        } catch (rollbackError) {
          // Rollback failed - we're in an inconsistent state!
          // In a real app, we'd need to log this and have a cleanup job
          console.error('Failed to rollback file after metadata save failure:', rollbackError);
        }
      }

      // Re-throw the original error
      if (error instanceof StorageError || error instanceof DatabaseError) {
        throw error;
      }

      throw new Error(`Failed to create document: ${error}`);
    }
  }

  async getDocument(id: string): Promise<Document> {
    validateDocumentId(id);

    // We need to fetch from two different systems
    // What if one succeeds and the other fails? What if they're out of sync?
    let metadata: DocumentMetadata;
    let content: string;

    try {
      metadata = await this.metadataStorage.get(id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError(`Failed to fetch metadata for document ${id}`, error instanceof Error ? error : undefined);
    }

    try {
      content = await this.fileStorage.readFile(id);
    } catch (error) {
      throw new StorageError(`Failed to fetch content for document ${id}`, error instanceof Error ? error : undefined);
    }

    return {
      ...metadata,
      content,
    };
  }

  async updateDocument(id: string, input: UpdateDocumentInput): Promise<Document> {
    validateDocumentId(id);
    const validatedInput = validateUpdateDocumentInput(input);

    // Get existing document
    const existing = await this.getDocument(id);

    // Update metadata
    const updatedMetadata: DocumentMetadata = {
      ...existing,
      title: validatedInput.title ?? existing.title,
      tags: validatedInput.tags ?? existing.tags,
      updatedAt: new Date(),
      size: validatedInput.content
        ? Buffer.byteLength(validatedInput.content, 'utf-8')
        : existing.size,
    };

    const updatedContent = validatedInput.content ?? existing.content;

    // Another "transaction" with rollback complexity
    let contentUpdated = false;
    let metadataUpdated = false;
    const oldContent = existing.content;

    try {
      // Update content if provided
      if (validatedInput.content) {
        await this.fileStorage.saveFile(id, validatedInput.content);
        contentUpdated = true;
      }

      // Update metadata
      await this.metadataStorage.save(updatedMetadata);
      metadataUpdated = true;

      return {
        ...updatedMetadata,
        content: updatedContent,
      };
    } catch (error) {
      // ROLLBACK LOGIC - getting even more complex!
      if (contentUpdated && !metadataUpdated) {
        try {
          // Try to restore old content
          await this.fileStorage.saveFile(id, oldContent);
        } catch (rollbackError) {
          console.error('Failed to rollback content after metadata update failure:', rollbackError);
        }
      }

      if (error instanceof StorageError || error instanceof DatabaseError) {
        throw error;
      }

      throw new Error(`Failed to update document: ${error}`);
    }
  }

  async deleteDocument(id: string): Promise<void> {
    validateDocumentId(id);

    // Verify document exists
    await this.metadataStorage.get(id); // throws NotFoundError if not found

    // Delete from both systems
    // Notice: if one succeeds and the other fails, we have orphaned data
    const errors: Error[] = [];

    try {
      await this.fileStorage.deleteFile(id);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      await this.metadataStorage.delete(id);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (errors.length > 0) {
      // How do we report multiple errors? We just throw the first one!
      throw new Error(`Failed to delete document: ${errors[0].message}`);
    }
  }

  async listDocuments(): Promise<DocumentMetadata[]> {
    try {
      return await this.metadataStorage.list();
    } catch (error) {
      throw new DatabaseError('Failed to list documents', error instanceof Error ? error : undefined);
    }
  }

  async searchByTag(tag: string): Promise<DocumentMetadata[]> {
    const allDocs = await this.listDocuments();
    return allDocs.filter(doc => doc.tags.includes(tag));
  }
}
