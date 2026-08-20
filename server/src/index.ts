import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import type { Server } from 'node:http';
import { fileURLToPath } from 'url';
import { cleanupUnusedImages } from './utils/cleanupImages';
import { prisma } from './prisma';
import { getPublicBaseUrl } from './publicUrl';
import { runPendingMigrations } from './lib/migrate';
import { isCurrentPublicCallbackOrigin } from './lib/publicOrigin';
import { shouldBlockRequest } from './lib/publicSurface';
import { attachAuth, requireAuth } from './middleware/auth';
import { closeTunnel, initTunnel, restartTunnel, tunnelStatus } from './lib/tunnel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Routes
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import spaceRoutes from './routes/spaces';
import bankRoutes from './routes/banks';
import categoryRoutes from './routes/categories';
import transactionRoutes from './routes/transactions';
import debtRoutes from './routes/debts';
import budgetRoutes from './routes/budgets';
import recurrenceRoutes from './routes/recurrences';
import dashboardRoutes from './routes/dashboard';
import objectiveRoutes from './routes/objectives';
import enablebankingRoutes, { syncAllBanks } from './routes/enablebanking';
import marketRoutes from './routes/market';
import settingsRoutes from './routes/settings';

dotenv.config();

// Dossier uploads: configurable via env (mode packagé) ou fallback local
// Utilise __dirname pour remonter à la racine du projet quel que soit le cwd
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, 'public/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Expose aux routes via env pour éviter de refactorer chaque route
process.env.UPLOADS_DIR = UPLOADS_DIR;

const app = express();
const PORT = process.env.PORT || 36321;

// CORS : Tauri utilise `tauri://localhost` en application packagée mais, en
// `tauri dev`, charge Vite depuis localhost:51737. Les deux doivent rester
// autorisés : le sidecar est toujours local et le port peut être un fallback.
const allowedOrigins = new Set([
  'http://localhost:51737',
  'http://127.0.0.1:51737',
  'tauri://localhost',
  'http://tauri.localhost',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
]);

// Première barrière : le tunnel HTTPS ne doit publier que le retour bancaire.
// Tout le reste de l'API n'existe pas pour un appelant venu d'Internet.
app.use((req, res, next) => {
  if (shouldBlockRequest(req.headers as Record<string, unknown>, req.originalUrl)) {
    console.warn(`[Sécurité] Requête publique refusée: ${req.method} ${req.path}`);
    return res.status(404).json({ error: 'Route not found' });
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin) || isCurrentPublicCallbackOrigin(origin, getPublicBaseUrl())) callback(null, true);
    else callback(new Error(`CORS: origin non autorisée: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
// Le choix d'un compte après le callback OAuth est envoyé par un formulaire
// HTTPS depuis la page publique ngrok.
app.use(express.urlencoded({ extended: false }));

// Serve static files (images) — chargées par des balises <img>, donc sans
// en-tête d'authentification possible. Elles restent locales : le tunnel les
// bloque déjà.
app.use('/uploads', express.static(UPLOADS_DIR));

// Identité de l'appelant, puis refus de tout ce qui n'en a pas.
app.use(attachAuth);
app.use(requireAuth);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/recurrences', recurrenceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/objectives', objectiveRoutes);
app.use('/api/enablebanking', enablebankingRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Finance Tracker API is running!' });
});

// Tunnel status
app.get('/api/tunnel', (_req, res) => {
  res.json(tunnelStatus());
});

// Redémarre le tunnel juste après l'enregistrement du token dans les réglages.
// Sans cette route, il ne démarrait qu'au prochain lancement de l'application
// et l'utilisateur recevait une URL localhost refusée par Enable Banking.
app.post('/api/tunnel/restart', async (_req, res) => {
  const tunnel = await restartTunnel();
  if (!tunnel.active) {
    return res.status(422).json({
      error: tunnel.error,
      publicUrl: tunnel.publicUrl,
      status: 'no_tunnel',
    });
  }
  res.json(tunnelStatus());
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    console.error('Payload too large:', err);
    return res.status(413).json({ error: 'Le fichier est trop volumineux. Taille maximale : 50 Mo.' });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler (Express 5 compatible)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Background Sync Scheduler (PSD2: 2×/day max unattended) ───
const SYNC_HOURS = [8, 20]; // 08:00 and 20:00 local time
// Clé « jour + heure » du dernier créneau déjà synchronisé (ex. « 2026-08-16 8 »).
let lastSyncDay = '';

async function runStartupSync() {
  console.log('[Startup] Running initial sync check…');
  try {
    const results = await syncAllBanks();
    if (results.length === 0) {
      console.log('[Startup] No linked banks to sync');
      return;
    }
    for (const r of results) {
      if (r.error) {
        console.error(`[Startup] ${r.bankName}: ${r.error}`);
      } else if (r.result) {
        console.log(`[Startup] ${r.bankName}: +${r.result.imported} imported, ${r.result.skipped} existing, ${r.result.pendingReconciled} reconciled`);
      }
    }
  } catch (err: any) {
    console.error('[Startup] Sync failed:', err.message);
  }
}

async function runScheduledSync() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Only sync at configured hours, once per hour-slot per day
  if (!SYNC_HOURS.includes(currentHour) || lastSyncDay === currentDay + currentHour) return;
  lastSyncDay = currentDay + currentHour;

  console.log(`[Cron] Starting scheduled sync at ${now.toLocaleTimeString()}`);
  try {
    const results = await syncAllBanks();
    for (const r of results) {
      if (r.error) {
        console.error(`[Cron] ${r.bankName}: ${r.error}`);
      } else if (r.result) {
        console.log(`[Cron] ${r.bankName}: +${r.result.imported} new, ${r.result.skipped} existing, ${r.result.pendingReconciled} reconciled`);
      }
    }
  } catch (err: any) {
    console.error('[Cron] Sync failed:', err.message);
  }
}

// Check every 10 minutes if it's time to sync
const SYNC_CHECK_INTERVAL_MS = 10 * 60 * 1000;
let syncCheckTimer: ReturnType<typeof setInterval> | null = null;
let httpServer: Server | null = null;
let shutdownPromise: Promise<void> | null = null;

function startSyncScheduler() {
  console.log(`[Cron] Sync scheduler started — runs at ${SYNC_HOURS.map(h => `${h}:00`).join(' and ')}`);
  syncCheckTimer = setInterval(runScheduledSync, SYNC_CHECK_INTERVAL_MS);
}

// Graceful shutdown: on ferme le tunnel ngrok puis la connexion Prisma, pour
// que l'app ne laisse aucun processus restant au moment de quitter.
function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    console.log(`${signal} received, shutting down gracefully`);
    if (syncCheckTimer) clearInterval(syncCheckTimer);

    // Ne plus accepter de requêtes avant de fermer Prisma. Cela évite qu'une
    // requête en vol tente d'utiliser une connexion déjà libérée.
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }

    await closeTunnel();
    await prisma.$disconnect();
  })();

  return shutdownPromise;
}

process.on('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.on('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));

async function startServer() {
  // Ne pas ouvrir le port avant que la base soit prête. Dans l'ancien flux,
  // le front pouvait appeler /profiles pendant une migration et recevoir 500.
  try {
    await runPendingMigrations();
  } catch (err: any) {
    console.error('[Migrations] Échec au démarrage — le serveur ne sera pas exposé:', err.message);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  // Écoute sur la boucle locale uniquement : le serveur est un sidecar de
  // l'application, pas un service réseau. L'agent ngrok tourne dans ce même
  // processus et atteint donc 127.0.0.1 sans difficulté.
  httpServer = app.listen(Number(PORT), '127.0.0.1', async () => {
  console.log(`🚀 Server running on 127.0.0.1:${PORT}`);
  console.log(`📊 Finance Tracker API ready!`);

  // Tunnel PSD2 : ouvert immédiatement seulement si son URL n'est pas stable.
  await initTunnel();

  // Nettoyer les images non utilisées au démarrage
  await cleanupUnusedImages();

  // Start background sync scheduler
  startSyncScheduler();

  // Startup sync: run once at boot for all linked banks
  runStartupSync();
  });

  httpServer.once('error', async (err) => {
    console.error(`[Server] Impossible d'écouter le port ${PORT}:`, err.message);
    await shutdown('Server error');
    process.exit(1);
  });
}

void startServer();

export { prisma };
