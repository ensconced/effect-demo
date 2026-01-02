import { ValidationError, UploadImageInput, ProcessingConfig } from './types.ts';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_DIMENSION = 100;
const MAX_DIMENSION = 8000;

/**
 * Validate image upload input
 * Notice how validation requires lots of manual error handling
 */
export function validateUploadInput(input: any, config?: ProcessingConfig): UploadImageInput {
  // Inject validation failure if requested
  if (config?.shouldFailValidation) {
    throw new ValidationError('Simulated validation failure', 'file');
  }

  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be an object');
  }

  // Validate file
  if (!input.file || !Buffer.isBuffer(input.file)) {
    throw new ValidationError('File is required and must be a Buffer', 'file');
  }

  if (input.file.length === 0) {
    throw new ValidationError('File cannot be empty', 'file');
  }

  if (input.file.length > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      'file',
      { maxSize: MAX_FILE_SIZE, actualSize: input.file.length }
    );
  }

  // Validate original name
  if (!input.originalName || typeof input.originalName !== 'string') {
    throw new ValidationError('Original filename is required', 'originalName');
  }

  if (input.originalName.trim().length === 0) {
    throw new ValidationError('Filename cannot be empty', 'originalName');
  }

  if (input.originalName.length > 255) {
    throw new ValidationError('Filename too long (max 255 characters)', 'originalName');
  }

  // Validate path traversal attacks
  if (input.originalName.includes('..') || input.originalName.includes('/')) {
    throw new ValidationError('Filename contains invalid characters', 'originalName');
  }

  // Validate MIME type
  if (!input.mimeType || typeof input.mimeType !== 'string') {
    throw new ValidationError('MIME type is required', 'mimeType');
  }

  if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
    throw new ValidationError(
      `Unsupported image type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      'mimeType',
      { allowedTypes: ALLOWED_MIME_TYPES, receivedType: input.mimeType }
    );
  }

  // Validate userId
  if (!input.userId || typeof input.userId !== 'string') {
    throw new ValidationError('User ID is required', 'userId');
  }

  if (input.userId.trim().length === 0) {
    throw new ValidationError('User ID cannot be empty', 'userId');
  }

  // Validate tags if provided
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      throw new ValidationError('Tags must be an array', 'tags');
    }

    for (const tag of input.tags) {
      if (typeof tag !== 'string') {
        throw new ValidationError('All tags must be strings', 'tags');
      }
      if (tag.trim().length === 0) {
        throw new ValidationError('Tags cannot be empty strings', 'tags');
      }
      if (tag.length > 50) {
        throw new ValidationError('Tag too long (max 50 characters)', 'tags');
      }
    }

    if (input.tags.length > 20) {
      throw new ValidationError('Too many tags (max 20)', 'tags');
    }
  }

  return {
    file: input.file,
    originalName: input.originalName.trim(),
    mimeType: input.mimeType,
    userId: input.userId.trim(),
    tags: input.tags || [],
  };
}

/**
 * Validate image dimensions
 */
export function validateImageDimensions(width: number, height: number): void {
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new ValidationError(
      `Image too small. Minimum dimensions: ${MIN_DIMENSION}x${MIN_DIMENSION}`,
      'dimensions',
      { minDimension: MIN_DIMENSION, actual: { width, height } }
    );
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ValidationError(
      `Image too large. Maximum dimensions: ${MAX_DIMENSION}x${MAX_DIMENSION}`,
      'dimensions',
      { maxDimension: MAX_DIMENSION, actual: { width, height } }
    );
  }
}

/**
 * Validate image ID
 */
export function validateImageId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new ValidationError('Image ID is required and must be a string', 'id');
  }
  if (id.trim().length === 0) {
    throw new ValidationError('Image ID cannot be empty', 'id');
  }
  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError('Invalid image ID format', 'id');
  }
}
