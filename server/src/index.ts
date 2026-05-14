import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { cleanupUnusedImages } from './utils/cleanupImages';
import { purgeExpiredSessions } from './lib/auth';
import { requireUser } from './middlewares/requireUser';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import bankRoutes from './routes/banks';
import categoryRoutes from './routes/categories';
import transactionRoutes from './routes/transactions';
import budgetRoutes from './routes/budgets';
import recurrenceRoutes from './routes/recurrences';
import dashboardRoutes from './routes/dashboard';
import objectiveRoutes from './routes/objectives';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Serve static files (images) — durcissement des headers pour bloquer l'inline d'éventuel HTML/SVG.
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'public/uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    },
  }),
);

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Finance Tracker API is running!' });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Routes protégées — toutes nécessitent une session valide
app.use('/api/users', requireUser, userRoutes);
app.use('/api/banks', requireUser, bankRoutes);
app.use('/api/categories', requireUser, categoryRoutes);
app.use('/api/transactions', requireUser, transactionRoutes);
app.use('/api/budgets', requireUser, budgetRoutes);
app.use('/api/recurrences', requireUser, recurrenceRoutes);
app.use('/api/dashboard', requireUser, dashboardRoutes);
app.use('/api/objectives', requireUser, objectiveRoutes);

// Multer error handler (file too large, etc.) — placé avant le 500 générique
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large (max 5 MB)' });
    }
    return res.status(400).json({ error: `Upload error: ${err.code}` });
  }
  next(err);
});

// Error handling middleware
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler (Express 5 compatible)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, async () => {
  logger.info({ port: PORT }, 'Finance Tracker API ready');

  // Nettoyer les images non utilisées au démarrage
  await cleanupUnusedImages();
  // Purger les sessions expirées
  await purgeExpiredSessions();
});

export { prisma };
