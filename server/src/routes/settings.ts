import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const SYNC_SETTINGS_PATH = path.resolve(__dirname, '..', '..', '..', 'data', 'sync-settings.json');

function ensureDir() {
  const dir = path.dirname(SYNC_SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readSyncSettings(): Record<string, any> {
  ensureDir();
  if (!fs.existsSync(SYNC_SETTINGS_PATH)) return {};
  return JSON.parse(fs.readFileSync(SYNC_SETTINGS_PATH, 'utf-8'));
}

function writeSyncSettings(data: Record<string, any>) {
  ensureDir();
  fs.writeFileSync(SYNC_SETTINGS_PATH, JSON.stringify(data, null, 2));
}

const d = (val: any): Date | null => (val ? new Date(val) : null);

// ── Version / mises à jour ─────────────────────────────────────────────
// Récupère la version courante depuis package.json
function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf-8')
    );
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Récupère la dernière version disponible (env ou fichier), sinon = courante
function getLatestVersion(current: string): string {
  const env = process.env.APP_LATEST_VERSION;
  if (env && env.trim()) return env.trim();
  try {
    const file = path.resolve(__dirname, '..', '..', '..', 'data', 'latest-version.txt');
    if (fs.existsSync(file)) {
      const v = fs.readFileSync(file, 'utf-8').trim();
      if (v) return v;
    }
  } catch {}
  return current;
}

// GET /api/settings/version
router.get('/version', (req, res) => {
  const current = getCurrentVersion();
  const latest = getLatestVersion(current);
  res.json({ current, latest });
});

// GET /api/settings/export
router.get('/export', async (req, res) => {
  try {
    const [users, banks, userBanks, categories, categoryKeywords, transactions, budgets, recurrences, objectives] =
      await Promise.all([
        prisma.user.findMany(),
        prisma.bank.findMany(),
        prisma.userBank.findMany(),
        prisma.category.findMany(),
        prisma.categoryKeyword.findMany(),
        prisma.transaction.findMany(),
        prisma.budget.findMany(),
        prisma.recurrence.findMany(),
        prisma.objective.findMany(),
      ]);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { users, banks, userBanks, categories, categoryKeywords, transactions, budgets, recurrences, objectives },
    };

    const filename = `findy-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: "Erreur lors de l'export" });
  }
});

// POST /api/settings/import
router.post('/import', async (req, res) => {
  const { data } = req.body;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Format de fichier invalide' });
  }

  const {
    users = [],
    banks = [],
    userBanks = [],
    categories = [],
    categoryKeywords = [],
    transactions = [],
    budgets = [],
    recurrences = [],
    objectives = [],
  } = data;

  try {
    await prisma.$transaction(
      async (tx) => {
        // Delete in reverse dependency order
        await tx.categoryKeyword.deleteMany();
        await tx.transaction.deleteMany();
        await tx.budget.deleteMany();
        await tx.recurrence.deleteMany();
        await tx.objective.deleteMany();
        await tx.userBank.deleteMany();
        await tx.category.deleteMany();
        await tx.bank.deleteMany();
        await tx.user.deleteMany();

        // Insert in dependency order
        for (const u of users) {
          await tx.user.create({
            data: {
              id: u.id,
              name: u.name,
              avatar: u.avatar ?? null,
              createdAt: new Date(u.createdAt),
              updatedAt: new Date(u.updatedAt),
            },
          });
        }

        for (const b of banks) {
          await tx.bank.create({
            data: {
              id: b.id,
              name: b.name,
              shortName: b.shortName ?? null,
              color: b.color,
              image: b.image ?? null,
              iban: b.iban ?? null,
              balance: b.balance,
              accountType: b.accountType,
              archived: b.archived,
              archivedAt: d(b.archivedAt),
              ebAspspName: b.ebAspspName ?? null,
              ebAspspCountry: b.ebAspspCountry ?? null,
              ebState: b.ebState ?? null,
              ebSessionId: b.ebSessionId ?? null,
              ebAccountUid: b.ebAccountUid ?? null,
              ebStatus: b.ebStatus ?? null,
              ebLinkedAt: d(b.ebLinkedAt),
              ebExpiresAt: d(b.ebExpiresAt),
              createdAt: new Date(b.createdAt),
              updatedAt: new Date(b.updatedAt),
            },
          });
        }

        for (const c of categories) {
          await tx.category.create({
            data: {
              id: c.id,
              name: c.name,
              type: c.type,
              color: c.color,
              icon: c.icon ?? null,
              createdAt: new Date(c.createdAt),
              updatedAt: new Date(c.updatedAt),
            },
          });
        }

        for (const o of objectives) {
          await tx.objective.create({
            data: {
              id: o.id,
              title: o.title,
              description: o.description ?? null,
              targetAmount: o.targetAmount,
              deadline: d(o.deadline),
              isCompleted: o.isCompleted,
              archived: o.archived ?? false,
              createdAt: new Date(o.createdAt),
              updatedAt: new Date(o.updatedAt),
            },
          });
        }

        for (const ub of userBanks) {
          await tx.userBank.create({
            data: { id: ub.id, userId: ub.userId, bankId: ub.bankId },
          });
        }

        for (const ck of categoryKeywords) {
          await tx.categoryKeyword.create({
            data: { id: ck.id, value: ck.value, categoryId: ck.categoryId },
          });
        }

        for (const t of transactions) {
          await tx.transaction.create({
            data: {
              id: t.id,
              amount: t.amount,
              description: t.description,
              date: new Date(t.date),
              checked: t.checked,
              unitPrice: t.unitPrice ?? null,
              quantity: t.quantity ?? null,
              ticker: t.ticker ?? null,
              assetType: t.assetType ?? null,
              externalId: t.externalId ?? null,
              bankId: t.bankId,
              categoryId: t.categoryId ?? null,
              createdAt: new Date(t.createdAt),
              updatedAt: new Date(t.updatedAt),
            },
          });
        }

        for (const b of budgets) {
          await tx.budget.create({
            data: {
              id: b.id,
              amount: b.amount,
              period: b.period,
              startDate: new Date(b.startDate),
              shared: b.shared,
              bankId: b.bankId ?? null,
              categoryId: b.categoryId,
              createdAt: new Date(b.createdAt),
              updatedAt: new Date(b.updatedAt),
            },
          });
        }

        for (const r of recurrences) {
          await tx.recurrence.create({
            data: {
              id: r.id,
              amount: r.amount,
              frequency: r.frequency,
              nextDue: new Date(r.nextDue),
              description: r.description,
              active: r.active,
              bankId: r.bankId ?? null,
              categoryId: r.categoryId,
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.updatedAt),
            },
          });
        }
      },
      { timeout: 120000 }
    );

    res.json({ success: true, message: 'Import réussi !' });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      error: "Erreur lors de l'import : " + (error instanceof Error ? error.message : 'inconnue'),
    });
  }
});

// ── Sync settings ───────────────────────────────────────────────────────

// GET /api/settings/sync
router.get('/sync', (req, res) => {
  try {
    const settings = readSyncSettings();
    // Mask API keys in response
    const masked: Record<string, any> = {};
    for (const [provider, config] of Object.entries(settings)) {
      const c = config as any;
      if (provider === 'enablebanking') {
        const configured = !!(c.appId && c.privateKey);
        masked[provider] = {
          configured,
          provider,
          appId: configured && c.appId ? `${c.appId.slice(0, 4)}…${c.appId.slice(-4)}` : null,
          hasPrivateKey: configured && !!c.privateKey,
          hasNgrokToken: !!(c.ngrokAuthToken),
          hasNgrokDomain: !!(c.ngrokDomain),
        };
      } else {
        masked[provider] = {
          configured: !!c.apiKey,
          provider,
        };
      }
    }
    res.json(masked);
  } catch (error) {
    console.error('Error reading sync settings:', error);
    res.status(500).json({ error: 'Failed to read sync settings' });
  }
});

// PUT /api/settings/sync/:provider
router.put('/sync/:provider', (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey, appId, privateKey, ngrokAuthToken, ngrokDomain, enabled } = req.body;

    const settings = readSyncSettings();

    if (provider === 'enablebanking') {
      // Enable Banking uses appId + privateKey
      if (!appId || !privateKey) {
        return res.status(400).json({ error: 'appId and privateKey are required for Enable Banking' });
      }
      settings[provider] = { appId, privateKey, ngrokAuthToken: ngrokAuthToken || '', ngrokDomain: ngrokDomain || '', enabled: enabled ?? true, updatedAt: new Date().toISOString() };
    } else {
      // Other providers use a single apiKey
      if (!apiKey && apiKey !== '') {
        return res.status(400).json({ error: 'apiKey is required' });
      }
      settings[provider] = { apiKey, enabled: enabled ?? true, updatedAt: new Date().toISOString() };
    }

    writeSyncSettings(settings);
    res.json({ configured: true, provider });
  } catch (error) {
    console.error('Error saving sync settings:', error);
    res.status(500).json({ error: 'Failed to save sync settings' });
  }
});

// DELETE /api/settings/sync/:provider
router.delete('/sync/:provider', (req, res) => {
  try {
    const { provider } = req.params;
    const settings = readSyncSettings();
    delete settings[provider];
    writeSyncSettings(settings);
    res.json({ configured: false, provider });
  } catch (error) {
    console.error('Error deleting sync settings:', error);
    res.status(500).json({ error: 'Failed to delete sync settings' });
  }
});

export default router;
