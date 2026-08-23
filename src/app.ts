import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { errorHandler, AppError } from './middleware/errorHandler.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import servicesRoutes from './modules/services/services.routes.js';
import posRoutes from './modules/pos/pos.routes.js';
import hrRoutes from './modules/hr/hr.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import taxRoutes from './modules/tax/tax.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import uploadRoutes from './modules/upload/upload.routes.js';
import expensesRoutes from './modules/expenses/expenses.routes.js';
import { generalApiLimiter } from './middleware/rateLimiter.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (): Express => {
  const app = express();

  // Basic Security Headers Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Strict CORS Configuration
  const envCors = process.env.CORS_ORIGIN;
  const defaultLocalOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];

  const allowedOrigins: string[] = (envCors
    ? envCors.split(',').map((o) => o.trim())
    : defaultLocalOrigins
  ).map((o) => o.replace(/\/+$/, ''));

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin SPA)
        if (!origin) {
          return callback(null, true);
        }
        const normalizedOrigin = origin.replace(/\/+$/, '');
        if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error('غير مسموح بالوصول عبر هذا النطاق (CORS Not Allowed)'));
        }
      },

      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-pin'],
      credentials: true,
    })
  );

  // Body parsers (5MB safe limit for standard JSON/URL-encoded payloads)
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Static Local Uploads Serving
  const uploadsPath = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsPath));

  // Basic request logger
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Health check & System info
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Mount General API Rate Limiter
  app.use('/api', generalApiLimiter);


  // Mount API Feature Modules
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/services', servicesRoutes);
  app.use('/api/pos', posRoutes);
  app.use('/api/hr', hrRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/tax', taxRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/expenses', expensesRoutes);


  // Production Static Serving for React Client (SPA fallback)
  const possibleDistPaths = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(__dirname, '../client/dist'),
  ];
  const clientDistPath = possibleDistPaths.find((p) => fs.existsSync(p));

  if (clientDistPath) {
    app.use(express.static(clientDistPath, { maxAge: '1d', index: false }));

    // Fallback for Single Page Application (SPA) routing
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next(new AppError(`المسار المطلوب غير موجود: ${req.method} ${req.originalUrl}`, 404));
      }

      const indexPath = path.join(clientDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      next();
    });
  } else {
    // API root info fallback when frontend is not built
    app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Car Wash ERP & POS API Server',
        version: '1.0.0',
        status: 'online',
        description: 'نظام إدارة مغسلة سيارات سحابي متكامل',
        endpoints: {
          pos: '/api/pos',
          inventory: '/api/inventory',
          services: '/api/services',
          hr: '/api/hr',
          dashboard: '/api/dashboard',
          tax: '/api/tax',
        },
      });
    });

    // 404 Handler for unmatched routes when client/dist does not exist
    app.use((req: Request, res: Response, next: NextFunction) => {
      next(new AppError(`المسار المطلوب غير موجود: ${req.method} ${req.originalUrl}`, 404));
    });
  }

  // Central Error Handler
  app.use(errorHandler);

  return app;
};

export default createApp;
