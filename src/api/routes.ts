import { Router, Request, Response } from 'express';
import { ImageService } from '../services/image-service.ts';
import {
  ValidationError,
  ProcessingError,
  StorageError,
  DatabaseError,
  ResourceError,
  NetworkError,
  ProcessingConfig,
} from '../types.ts';

/**
 * API Routes
 *
 * PAIN POINTS TO NOTICE:
 * 1. Repetitive error handling in every route
 * 2. Manual mapping of domain errors to HTTP status codes
 * 3. No type safety for request/response
 * 4. Error handling logic is duplicated across routes
 * 5. Error injection via query params (for demo purposes)
 */
export function createRouter(imageService: ImageService): Router {
  const router = Router();

  /**
   * Upload and process image
   *
   * Error injection via query parameters:
   * ?fail=validation - Trigger validation error
   * ?fail=resize - Fail all resizes
   * ?fail=resize-partial - Fail 2/4 resizes
   * ?fail=storage - Fail local storage
   * ?fail=s3 - Fail S3 upload
   * ?fail=cdn - Fail CDN publish
   * ?fail=metadata - Fail metadata save
   * ?fail=storage,cdn - Multiple failures
   * ?failureRate=0.3 - 30% random failure rate
   */
  router.post('/images', async (req: Request, res: Response) => {
    try {
      // Extract error injection config from query params
      const config: ProcessingConfig = buildConfigFromQuery(req.query);

      // In production, would use multer for multipart/form-data
      // For demo, accepting base64 encoded image in JSON
      const { file, originalName, mimeType, userId, tags } = req.body;

      if (!file) {
        throw new ValidationError('Missing file data', 'file');
      }

      // Decode base64 to Buffer
      const fileBuffer = Buffer.from(file, 'base64');

      const metadata = await imageService.processImage(
        {
          file: fileBuffer,
          originalName,
          mimeType,
          userId,
          tags,
        },
        config
      );

      res.status(201).json(metadata);
    } catch (error) {
      handleError(error, res);
    }
  });

  // Get image metadata
  router.get('/images/:id', async (req: Request, res: Response) => {
    try {
      const metadata = await imageService.getImage(req.params.id);
      res.json(metadata);
    } catch (error) {
      handleError(error, res);
    }
  });

  // Delete image
  router.delete('/images/:id', async (req: Request, res: Response) => {
    try {
      await imageService.deleteImage(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleError(error, res);
    }
  });

  // List all images
  router.get('/images', async (req: Request, res: Response) => {
    try {
      const images = await imageService.listImages();
      res.json(images);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}

/**
 * Build ProcessingConfig from query parameters
 * This enables error injection for demo purposes
 */
function buildConfigFromQuery(query: any): ProcessingConfig {
  const failParam = query.fail as string | undefined;
  const failureRate = query.failureRate ? parseFloat(query.failureRate as string) : undefined;

  const failPoints = failParam ? failParam.split(',') : [];

  return {
    shouldFailValidation: failPoints.includes('validation'),
    shouldFailResize: failPoints.includes('resize'),
    shouldFailResizePartial: failPoints.includes('resize-partial'),
    shouldFailOptimize: failPoints.includes('optimize'),
    shouldFailStorage: failPoints.includes('storage'),
    shouldFailS3: failPoints.includes('s3'),
    shouldFailCDN: failPoints.includes('cdn'),
    shouldFailMetadata: failPoints.includes('metadata'),
    failureRate,
  };
}

/**
 * Centralized error handler
 * Notice how we need to manually map error types to HTTP status codes
 * This is still repetitive and easy to get wrong
 */
function handleError(error: unknown, res: Response): void {
  console.error('\nError occurred:', error);

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      field: error.field,
      details: error.details,
    });
  } else if (error instanceof ProcessingError) {
    res.status(500).json({
      error: 'Processing Error',
      message: error.message,
      stage: error.stage,
    });
  } else if (error instanceof StorageError) {
    res.status(500).json({
      error: 'Storage Error',
      message: error.message,
      location: error.location,
    });
  } else if (error instanceof DatabaseError) {
    res.status(500).json({
      error: 'Database Error',
      message: error.message,
    });
  } else if (error instanceof ResourceError) {
    res.status(500).json({
      error: 'Resource Error',
      message: error.message,
      resourceType: error.resourceType,
    });
  } else if (error instanceof NetworkError) {
    res.status(503).json({
      error: 'Network Error',
      message: error.message,
      retryable: error.retryable,
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
