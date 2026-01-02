import { ValidationError, CreateDocumentInput, UpdateDocumentInput } from './types';

// Notice how validation requires lots of manual error handling
export function validateCreateDocumentInput(input: any): CreateDocumentInput {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be an object');
  }

  if (!input.title || typeof input.title !== 'string') {
    throw new ValidationError('Title is required and must be a string', 'title');
  }

  if (input.title.trim().length === 0) {
    throw new ValidationError('Title cannot be empty', 'title');
  }

  if (input.title.length > 200) {
    throw new ValidationError('Title cannot exceed 200 characters', 'title');
  }

  if (!input.content || typeof input.content !== 'string') {
    throw new ValidationError('Content is required and must be a string', 'content');
  }

  if (input.content.trim().length === 0) {
    throw new ValidationError('Content cannot be empty', 'content');
  }

  if (!input.author || typeof input.author !== 'string') {
    throw new ValidationError('Author is required and must be a string', 'author');
  }

  if (input.author.trim().length === 0) {
    throw new ValidationError('Author cannot be empty', 'author');
  }

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
    }
  }

  return {
    title: input.title.trim(),
    content: input.content,
    author: input.author.trim(),
    tags: input.tags || [],
  };
}

export function validateUpdateDocumentInput(input: any): UpdateDocumentInput {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be an object');
  }

  const validated: UpdateDocumentInput = {};

  if (input.title !== undefined) {
    if (typeof input.title !== 'string') {
      throw new ValidationError('Title must be a string', 'title');
    }
    if (input.title.trim().length === 0) {
      throw new ValidationError('Title cannot be empty', 'title');
    }
    if (input.title.length > 200) {
      throw new ValidationError('Title cannot exceed 200 characters', 'title');
    }
    validated.title = input.title.trim();
  }

  if (input.content !== undefined) {
    if (typeof input.content !== 'string') {
      throw new ValidationError('Content must be a string', 'content');
    }
    if (input.content.trim().length === 0) {
      throw new ValidationError('Content cannot be empty', 'content');
    }
    validated.content = input.content;
  }

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
    }
    validated.tags = input.tags;
  }

  return validated;
}

export function validateDocumentId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new ValidationError('Document ID is required and must be a string', 'id');
  }
  if (id.trim().length === 0) {
    throw new ValidationError('Document ID cannot be empty', 'id');
  }
}
