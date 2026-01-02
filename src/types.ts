// Domain types
export interface Document {
  id: string;
  title: string;
  content: string;
  author: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  size: number;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  author: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  size: number;
}

export interface CreateDocumentInput {
  title: string;
  content: string;
  author: string;
  tags?: string[];
}

export interface UpdateDocumentInput {
  title?: string;
  content?: string;
  tags?: string[];
}

// Error types - notice how we need to manually handle all these cases
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string, public resourceId?: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class StorageError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'StorageError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public retryable: boolean = true) {
    super(message);
    this.name = 'NetworkError';
  }
}
