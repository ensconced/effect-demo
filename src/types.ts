// Domain types for image processing

export type ImageSize = 'thumbnail' | 'small' | 'medium' | 'large' | 'original';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  dimensions: ImageDimensions;
  uploadedAt: Date;
  processedAt?: Date;
  sizes: Record<ImageSize, ImageVariant>;
  tags: string[];
  userId: string;
}

export interface ImageVariant {
  size: ImageSize;
  dimensions: ImageDimensions;
  fileSize: number;
  filePath: string;
  s3Url?: string;
  cdnUrl?: string;
}

export interface UploadImageInput {
  file: Buffer;
  originalName: string;
  mimeType: string;
  userId: string;
  tags?: string[];
}

export interface ProcessingConfig {
  shouldFailValidation?: boolean;
  shouldFailResize?: boolean;
  shouldFailResizePartial?: boolean;
  shouldFailOptimize?: boolean;
  shouldFailStorage?: boolean;
  shouldFailS3?: boolean;
  shouldFailCDN?: boolean;
  shouldFailMetadata?: boolean;
  failureRate?: number; // 0-1, simulated random failures
}

// Size configurations
export const SIZE_CONFIGS: Record<ImageSize, ImageDimensions> = {
  thumbnail: { width: 150, height: 150 },
  small: { width: 480, height: 480 },
  medium: { width: 1024, height: 1024 },
  large: { width: 2048, height: 2048 },
  original: { width: 4096, height: 4096 }, // max original size
};

// Error types - notice how we need to manually handle all these cases

export class ValidationError extends Error {
  field?: string;
  details?: any;

  constructor(message: string, field?: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.details = details;
  }
}

export class ProcessingError extends Error {
  stage?: string;
  cause?: Error;

  constructor(message: string, stage?: string, cause?: Error) {
    super(message);
    this.name = 'ProcessingError';
    this.stage = stage;
    this.cause = cause;
  }
}

export class StorageError extends Error {
  location?: string;
  cause?: Error;

  constructor(message: string, location?: string, cause?: Error) {
    super(message);
    this.name = 'StorageError';
    this.location = location;
    this.cause = cause;
  }
}

export class DatabaseError extends Error {
  cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = cause;
  }
}

export class NetworkError extends Error {
  retryable: boolean;
  cause?: Error;

  constructor(message: string, retryable: boolean = true, cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    this.retryable = retryable;
    this.cause = cause;
  }
}

export class ResourceError extends Error {
  resourceType?: string;
  cause?: Error;

  constructor(message: string, resourceType?: string, cause?: Error) {
    super(message);
    this.name = 'ResourceError';
    this.resourceType = resourceType;
    this.cause = cause;
  }
}
