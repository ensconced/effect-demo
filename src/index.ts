import express from 'express';
import { ImageProcessor } from './processing/image-processor.ts';
import { FileStorage } from './storage/file-storage.ts';
import { S3Storage } from './storage/s3-storage.ts';
import { CDNPublisher } from './storage/cdn-publisher.ts';
import { MetadataStorage } from './storage/metadata-storage.ts';
import { ImageService } from './services/image-service.ts';
import { createRouter } from './api/routes.ts';

/**
 * Main application entry point
 *
 * PAIN POINTS TO NOTICE:
 * 1. Manual dependency wiring - hard to test, hard to modify
 * 2. No dependency injection framework
 * 3. Initialization order matters and is implicit
 * 4. Global error handling is basic
 */

const PORT = process.env.PORT || 3000;

async function main() {
  console.log('Starting image processing service...\n');

  // ============================================================
  // MANUAL DEPENDENCY WIRING
  // Notice: We're manually creating 5 dependencies
  // Order matters! Testing this is painful!
  // ============================================================
  const imageProcessor = new ImageProcessor('./data/temp');
  const fileStorage = new FileStorage('./data/files');
  const s3Storage = new S3Storage('./data/s3');
  const cdnPublisher = new CDNPublisher('https://cdn.example.com');
  const metadataStorage = new MetadataStorage('./data/metadata.json');

  const imageService = new ImageService(
    imageProcessor,
    fileStorage,
    s3Storage,
    cdnPublisher,
    metadataStorage
  );

  // Initialize everything
  // What if initialization fails? We need to handle it manually
  try {
    await imageService.initialize();
    console.log('✓ Image service initialized\n');
  } catch (error) {
    console.error('Failed to initialize image service:', error);
    process.exit(1);
  }

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' })); // Large limit for base64 images

  // Request logging middleware
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use('/api', createRouter(imageService));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'image-processing' });
  });

  // Global error handler
  // Express v5 automatically catches errors in async route handlers
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`Image Processing Service`);
    console.log(`========================================`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API base URL: http://localhost:${PORT}/api`);
    console.log(`\nError Injection Examples:`);
    console.log(`  POST /api/images?fail=validation`);
    console.log(`  POST /api/images?fail=resize-partial`);
    console.log(`  POST /api/images?fail=cdn`);
    console.log(`  POST /api/images?fail=storage,cdn`);
    console.log(`========================================\n`);
  });
}

// Top-level error handling
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
