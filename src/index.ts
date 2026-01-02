import express from 'express';
import { FileStorage } from './storage/file-storage';
import { MetadataStorage } from './storage/metadata-storage';
import { DocumentService } from './services/document-service';
import { createRouter } from './api/routes';

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
  console.log('Starting document service...');

  // Manually wire up dependencies
  // Notice: order matters! We need to initialize storage before service
  const fileStorage = new FileStorage('./data/files');
  const metadataStorage = new MetadataStorage('./data/metadata.json');

  const documentService = new DocumentService(fileStorage, metadataStorage);

  // Initialize everything
  // What if initialization fails? We need to handle it manually
  try {
    await documentService.initialize();
    console.log('Document service initialized');
  } catch (error) {
    console.error('Failed to initialize document service:', error);
    process.exit(1);
  }

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use('/api', createRouter(documentService));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Global error handler
  // Notice: this doesn't catch errors in async route handlers!
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API base URL: http://localhost:${PORT}/api`);
  });
}

// Top-level error handling
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
