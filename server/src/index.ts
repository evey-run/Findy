import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { cleanupUnusedImages } from './utils/cleanupImages';

// Routes
import userRoutes from './routes/users';
import bankRoutes from './routes/banks';
import categoryRoutes from './routes/categories';
import transactionRoutes from './routes/transactions';
import budgetRoutes from './routes/budgets';
import recurrenceRoutes from './routes/recurrences';
import dashboardRoutes from './routes/dashboard';
import objectiveRoutes from './routes/objectives';
import enablebankingRoutes from './routes/enablebanking';

dotenv.config();

// Dossier uploads: configurable via env (mode packagé) ou fallback local
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'public/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Expose aux routes via env pour éviter de refactorer chaque route
process.env.UPLOADS_DIR = UPLOADS_DIR;

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 36321;

// CORS: accepte dev local ET Tauri webview (tauri://localhost)
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:51737', 'tauri://localhost', 'http://tauri.localhost'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error(`CORS: origin non autorisée: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());

// Serve static files (images)
app.use('/uploads', express.static(UPLOADS_DIR));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/recurrences', recurrenceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/objectives', objectiveRoutes);
app.use('/api/enablebanking', enablebankingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Finance Tracker API is running!' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler (Express 5 compatible)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Finance Tracker API ready!`);
  
  // Nettoyer les images non utilisées au démarrage
  await cleanupUnusedImages();
});

export { prisma };
