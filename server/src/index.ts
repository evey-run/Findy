import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
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

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 36321;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:51737',
  credentials: true
}));
app.use(express.json());

// Serve static files (images)
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/recurrences', recurrenceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/objectives', objectiveRoutes);

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
