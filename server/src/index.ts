import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { cleanupUnusedImages } from './utils/cleanupImages';
import { prisma } from './prisma';
import ngrok from '@ngrok/ngrok';
import { setPublicBaseUrl, getPublicBaseUrl } from './publicUrl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Routes
import userRoutes from './routes/users';
import bankRoutes from './routes/banks';
import categoryRoutes from './routes/categories';
import transactionRoutes from './routes/transactions';
import budgetRoutes from './routes/budgets';
import recurrenceRoutes from './routes/recurrences';
import dashboardRoutes from './routes/dashboard';
import objectiveRoutes from './routes/objectives';
import enablebankingRoutes, { syncAllBanks } from './routes/enablebanking';
import marketRoutes from './routes/market';
import settingsRoutes from './routes/settings';

dotenv.config();

// ─── Ngrok Tunnel (PSD2 OAuth callback requires HTTPS public URL) ───
const SYNC_SETTINGS_PATH = path.resolve(__dirname, '..', '..', 'data', 'sync-settings.json');
const TUNNEL_URL_PATH = path.resolve(__dirname, '..', '..', 'data', 'tunnel-url.json');

function readSyncSettings(): Record<string, any> {
  try {
    if (fs.existsSync(SYNC_SETTINGS_PATH)) return JSON.parse(fs.readFileSync(SYNC_SETTINGS_PATH, 'utf-8'));
  } catch {}
  return {};
}

async function startNgrokTunnel() {
  const settings = readSyncSettings();
  const authtoken = settings?.enablebanking?.ngrokAuthToken || process.env.NGROK_AUTHTOKEN;
  const domain = settings?.enablebanking?.ngrokDomain || process.env.NGROK_DOMAIN || undefined;

  if (!authtoken) {
    // No token — check if we have a saved URL to reuse
    try {
      if (fs.existsSync(TUNNEL_URL_PATH)) {
        const saved = JSON.parse(fs.readFileSync(TUNNEL_URL_PATH, 'utf-8'));
        if (saved.url) {
          setPublicBaseUrl(saved.url);
          console.log(`[Tunnel] Using saved URL (ngrok not started): ${saved.url}`);
          return;
        }
      }
    } catch {}
    console.log('[Tunnel] No ngrok auth token — OAuth will use localhost');
    return;
  }

  try {
    const forwardOpts: any = {
      addr: Number(process.env.PORT || 36321),
      authtoken,
    };
    if (domain) {
      forwardOpts.domain = domain;
    }
    const listener = await ngrok.forward(forwardOpts);
    const url = listener.url();
    setPublicBaseUrl(url);
    console.log(`[Tunnel] Established: ${url}${domain ? ` (domain: ${domain})` : ''}`);

    // Save URL for persistence across restarts
    try {
      fs.writeFileSync(TUNNEL_URL_PATH, JSON.stringify({ url, domain: domain || null }, null, 2));
    } catch {}
  } catch (err: any) {
    console.error('[Tunnel] Failed to start:', err.message);
    // Fallback to saved URL
    try {
      if (fs.existsSync(TUNNEL_URL_PATH)) {
        const saved = JSON.parse(fs.readFileSync(TUNNEL_URL_PATH, 'utf-8'));
        if (saved.url) {
          setPublicBaseUrl(saved.url);
          console.log(`[Tunnel] Using saved URL after error: ${saved.url}`);
        }
      }
    } catch {}
  }
}

// Dossier uploads: configurable via env (mode packagé) ou fallback local
// Utilise __dirname pour remonter à la racine du projet quel que soit le cwd
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, 'public/uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Expose aux routes via env pour éviter de refactorer chaque route
process.env.UPLOADS_DIR = UPLOADS_DIR;

const app = express();
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
app.use(express.json({ limit: '50mb' }));

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
app.use('/api/market', marketRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Finance Tracker API is running!' });
});

// Tunnel status
app.get('/api/tunnel', (req, res) => {
  const url = getPublicBaseUrl();
  const isHttps = url.startsWith('https://');
  const isNgrok = url.includes('ngrok');
  const isLocalhost = url.includes('localhost');
  res.json({
    publicUrl: url,
    isHttps,
    isNgrok,
    isLocalhost,
    status: isHttps && !isLocalhost ? 'ready' : isLocalhost ? 'no_tunnel' : 'unknown',
  });
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
let lastSyncDay = -1;

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

function startSyncScheduler() {
  console.log(`[Cron] Sync scheduler started — runs at ${SYNC_HOURS.map(h => `${h}:00`).join(' and ')}`);
  setInterval(runScheduledSync, SYNC_CHECK_INTERVAL_MS);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Finance Tracker API ready!`);
  
  // Start tunnel for PSD2 OAuth (public HTTPS URL)
  await startNgrokTunnel();

  // Nettoyer les images non utilisées au démarrage
  await cleanupUnusedImages();

  // Start background sync scheduler
  startSyncScheduler();

  // Startup sync: run once at boot for all linked banks
  runStartupSync();
});

export { prisma };
