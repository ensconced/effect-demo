import { Router, Request, Response, NextFunction } from 'express';
import { DocumentService } from '../services/document-service';
import {
  ValidationError,
  NotFoundError,
  StorageError,
  DatabaseError,
} from '../types';

/**
 * API Routes
 *
 * PAIN POINTS TO NOTICE:
 * 1. Repetitive error handling in every route
 * 2. Manual mapping of domain errors to HTTP status codes
 * 3. No type safety for request/response
 * 4. Error handling logic is duplicated across routes
 */
export function createRouter(documentService: DocumentService): Router {
  const router = Router();

  // Create document
  router.post('/documents', async (req: Request, res: Response) => {
    try {
      const document = await documentService.createDocument(req.body);
      res.status(201).json(document);
    } catch (error) {
      handleError(error, res);
    }
  });

  // Get document
  router.get('/documents/:id', async (req: Request, res: Response) => {
    try {
      const document = await documentService.getDocument(req.params.id);
      res.json(document);
    } catch (error) {
      handleError(error, res);
    }
  });

  // Update document
  router.put('/documents/:id', async (req: Request, res: Response) => {
    try {
      const document = await documentService.updateDocument(req.params.id, req.body);
      res.json(document);
    } catch (error) {
      handleError(error, res);
    }
  });

  // Delete document
  router.delete('/documents/:id', async (req: Request, res: Response) => {
    try {
      await documentService.deleteDocument(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(error, res);
    }
  });

  // List documents
  router.get('/documents', async (req: Request, res: Response) => {
    try {
      const tag = req.query.tag as string | undefined;

      const documents = tag
        ? await documentService.searchByTag(tag)
        : await documentService.listDocuments();

      res.json(documents);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}

/**
 * Centralized error handler
 * Notice how we need to manually map error types to HTTP status codes
 * This is still repetitive and easy to get wrong
 */
function handleError(error: unknown, res: Response): void {
  console.error('Error:', error);

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      field: error.field,
    });
  } else if (error instanceof NotFoundError) {
    res.status(404).json({
      error: 'Not Found',
      message: error.message,
      resourceId: error.resourceId,
    });
  } else if (error instanceof StorageError) {
    res.status(500).json({
      error: 'Storage Error',
      message: error.message,
    });
  } else if (error instanceof DatabaseError) {
    res.status(500).json({
      error: 'Database Error',
      message: error.message,
    });
  } else if (error instanceof Error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  } else {
    res.status(500).json({
      error: 'Unknown Error',
      message: 'An unexpected error occurred',
    });
  }
}
