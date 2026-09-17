import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import productRoutes from './modules/products/product.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import customerRoutes from './modules/customers/customer.routes';
import enquiryRoutes from './modules/enquiries/enquiry.routes';
import quotationRoutes from './modules/quotations/quotation.routes';
import orderRoutes from './modules/sales-orders/order.routes';
import dispatchRoutes from './modules/dispatches/dispatch.routes';
import idempotencyRoutes from './modules/idempotency/idempotency.routes';
import { errorHandler } from './middlewares/error.middleware';

export function createApp(): Express {
  const app = express();

  // Security and common middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      // Idempotency-Key is included so browsers allow the header in CORS requests
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    })
  );
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Business module routes
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/enquiries', enquiryRoutes);
  app.use('/api/quotations', quotationRoutes);
  app.use('/api/sales-orders', orderRoutes);
  app.use('/api/dispatches', dispatchRoutes);

  // Idempotency management (admin only)
  app.use('/api/idempotency', idempotencyRoutes);

  // Centralized error handling
  app.use(errorHandler);

  return app;
}
