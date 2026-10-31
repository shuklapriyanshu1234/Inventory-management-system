import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import prisma from './db';
import { swaggerDocument } from './swagger';
import { errorHandler } from './middlewares/error';

// Route modules
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import productRoutes from './modules/products/routes';
import locationRoutes from './modules/locations/routes';
import inventoryRoutes from './modules/inventory/routes';
import orderRoutes from './modules/orders/routes';
import supplierRoutes from './modules/suppliers/routes';
import barcodeRfidRoutes from './modules/barcode_rfid/routes';
import reportRoutes from './modules/reports/routes';
import integrationRoutes from './modules/integrations/routes';
import migrationRoutes from './modules/migration/routes';

export function createApp(): Express {
  const app = express();

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Allows inline scripts for frontend SPA & camera access
    crossOriginEmbedderPolicy: false
  }));

  // CORS
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  }));

  // Body Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate Limiter
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  });
  app.use('/api', limiter);

  // Serve static uploads
  app.use('/uploads', express.static(config.uploadDir));

  // Serve client static frontend files
  const clientPath = path.resolve(__dirname, '../../client');
  app.use(express.static(clientPath));

  // Health check endpoint
  app.get('/health', async (req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        service: 'XYZ Retail Inventory System',
        database: 'CONNECTED',
        uptime: process.uptime()
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'DOWN',
        database: 'DISCONNECTED',
        error: err.message
      });
    }
  });

  // Swagger OpenAPI Docs
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/locations', locationRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/barcode-rfid', barcodeRfidRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/migration', migrationRoutes);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
