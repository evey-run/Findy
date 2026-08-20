import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import prisma from '../prisma';
import { ensurePersistenceDir, SYNC_SETTINGS_PATH } from '../lib/persistence';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, 'public/uploads');
const IMAGE_EXTENSION = /\.(avif|gif|jpe?g|png|webp)$/i;

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 200 },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/') && IMAGE_EXTENSION.test(file.originalname));
  },
});

function countImages(directory: string): number {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((count, entry) => {
      if (entry.isDirectory()) return count + countImages(path.join(directory, entry.name));
      return count + (IMAGE_EXTENSION.test(entry.name) ? 1 : 0);
    }, 0);
  } catch {
    return 0;
  }
}

/** Préserve uniquement le nom de fichier et, pour les avatars, leur sous-dossier. */
function mediaRelativePath(candidate: unknown, fallbackName: string): string | null {
  const raw = typeof candidate === 'string' && candidate.trim() ? candidate : fallbackName;
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  const avatarIndex = parts.lastIndexOf('avatars');
  const relativePath = avatarIndex >= 0
    ? parts.slice(avatarIndex).join('/')
    : path.basename(parts[parts.length - 1] || fallbackName);

  return IMAGE_EXTENSION.test(relativePath) ? relativePath : null;
}

function ensureDir() {
  ensurePersistenceDir();
}

function readSyncSettings(): Record<string, any> {
  ensureDir();
  if (!fs.existsSync(SYNC_SETTINGS_PATH)) return {};
  return JSON.parse(fs.readFileSync(SYNC_SETTINGS_PATH, 'utf-8'));
}

function writeSyncSettings(data: Record<string, any>) {
  ensureDir();
  fs.writeFileSync(SYNC_SETTINGS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
  // Une ancienne installation peut avoir créé le fichier avec les permissions
  // par défaut de l'umask. Les identifiants ne doivent être lisibles que par
  // l'utilisateur courant.
  fs.chmodSync(SYNC_SETTINGS_PATH, 0o600);
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

// GET /api/settings/media — état des images locales (logos de banques et avatars)
router.get('/media', (_req, res) => {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  res.json({ imageCount: countImages(UPLOADS_DIR) });
});

// POST /api/settings/media/import — restaure des images d'une ancienne installation.
// Les fichiers existants ne sont jamais remplacés : l'opération est sûre à répéter.
router.post('/media/import', mediaUpload.array('images', 200), (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const suppliedPaths = Array.isArray(req.body?.legacyPath)
      ? req.body.legacyPath
      : req.body?.legacyPath ? [req.body.legacyPath] : [];
    const uploadsRoot = path.resolve(UPLOADS_DIR);
    fs.mkdirSync(uploadsRoot, { recursive: true });

    let imported = 0;
    let skipped = 0;
    for (const [index, file] of files.entries()) {
      const relativePath = mediaRelativePath(suppliedPaths[index], file.originalname);
      if (!relativePath) {
        skipped += 1;
        continue;
      }

      const destination = path.resolve(uploadsRoot, relativePath);
      if (!destination.startsWith(`${uploadsRoot}${path.sep}`)) {
        skipped += 1;
        continue;
      }

      if (fs.existsSync(destination)) {
        skipped += 1;
        continue;
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, file.buffer, { flag: 'wx' });
      imported += 1;
    }

    res.status(201).json({ imported, skipped, imageCount: countImages(uploadsRoot) });
  } catch (error) {
    console.error('Image restoration error:', error);
    res.status(500).json({ error: 'Impossible de restaurer les images.' });
  }
});

// GET /api/settings/export
router.get('/export', async (req, res) => {
  try {
    const [users, banks, spaces, spaceMembers, categories, categoryKeywords, transactions, budgets, recurrences, objectives] =
      await Promise.all([
        prisma.user.findMany(),
        prisma.bank.findMany(),
        prisma.space.findMany(),
        prisma.spaceMember.findMany(),
        prisma.category.findMany(),
        prisma.categoryKeyword.findMany(),
        prisma.transaction.findMany(),
        prisma.budget.findMany(),
        prisma.recurrence.findMany(),
        prisma.objective.findMany(),
      ]);

    const syncSettings = readSyncSettings();

    const backup = {
      // v3 : `userBanks` remplacé par `spaces` + `spaceMembers`. Les sauvegardes
      // v2 restent importables (voir la reconstruction d'espaces plus bas).
      version: 3,
      exportedAt: new Date().toISOString(),
      data: { users, banks, spaces, spaceMembers, categories, categoryKeywords, transactions, budgets, recurrences, objectives },
      syncSettings: Object.keys(syncSettings).length ? syncSettings : undefined,
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
  const { data, syncSettings } = req.body;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Format de fichier invalide' });
  }

  const {
    users = [],
    banks = [],
    userBanks = [], // sauvegardes v2 — converties en espaces à la restauration
    spaces = [],
    spaceMembers = [],
    categories = [],
    categoryKeywords = [],
    transactions = [],
    budgets = [],
    recurrences = [],
    objectives = [],
  } = data;

  // Restore sync settings (credentials, tokens, etc.) before DB transaction
  if (syncSettings && typeof syncSettings === 'object') {
    writeSyncSettings(syncSettings);
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.categoryKeyword.deleteMany();
        await tx.transaction.deleteMany();
        await tx.budget.deleteMany();
        await tx.recurrence.deleteMany();
        await tx.objective.deleteMany();
        await tx.category.deleteMany();
        await tx.bank.deleteMany();
        await tx.spaceMember.deleteMany();
        await tx.space.deleteMany();
        await tx.user.deleteMany();

        if (users.length) {
          await tx.user.createMany({
            data: users.map(u => ({
              id: u.id,
              name: u.name,
              avatar: u.avatar ?? null,
              // Sans ces deux champs, une restauration effaçait silencieusement
              // les mots de passe et le profil « Moi ».
              passwordHash: u.passwordHash ?? null,
              isMe: u.isMe ?? false,
              createdAt: new Date(u.createdAt),
              updatedAt: new Date(u.updatedAt),
            })),
          });
        }

        // Espaces : soit ceux de la sauvegarde (v3), soit reconstruits depuis
        // les anciennes relations userBanks (v2) — un espace par set de
        // propriétaires, exactement comme le backfill de migration.
        let legacySpaceByBank = new Map<string, string>();
        if (spaces.length) {
          await tx.space.createMany({
            data: spaces.map(sp => ({
              id: sp.id,
              name: sp.name,
              kind: sp.kind ?? 'PERSONAL',
              color: sp.color ?? null,
              createdAt: new Date(sp.createdAt),
              updatedAt: new Date(sp.updatedAt),
            })),
          });
          if (spaceMembers.length) {
            await tx.spaceMember.createMany({
              data: spaceMembers.map(m => ({
                id: m.id,
                spaceId: m.spaceId,
                userId: m.userId,
                createdAt: new Date(m.createdAt),
              })),
            });
          }
        } else if (userBanks.length) {
          const ownersByBank = new Map<string, string[]>();
          for (const ub of userBanks) {
            ownersByBank.set(ub.bankId, [...(ownersByBank.get(ub.bankId) ?? []), ub.userId]);
          }
          const spaceIdByKey = new Map<string, string>();
          let seq = 0;
          for (const [bankId, owners] of ownersByBank) {
            const unique = [...new Set(owners)].sort();
            const key = unique.join('|');
            let spaceId = spaceIdByKey.get(key);
            if (!spaceId) {
              spaceId = `sp_restored_${seq++}`;
              const names = unique.map(id => users.find(u => u.id === id)?.name).filter(Boolean);
              await tx.space.create({
                data: {
                  id: spaceId,
                  name: unique.length === users.length && users.length > 1 ? 'Famille' : names.join(' & ') || 'Espace',
                  kind: unique.length === 1 ? 'PERSONAL' : 'SHARED',
                  members: { create: unique.map(userId => ({ userId })) },
                },
              });
              spaceIdByKey.set(key, spaceId);
            }
            legacySpaceByBank.set(bankId, spaceId);
          }
        }

        if (banks.length) {
          await tx.bank.createMany({
            data: banks.map(b => ({
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
              spaceId: b.spaceId ?? legacySpaceByBank.get(b.id) ?? null,
              createdAt: new Date(b.createdAt),
              updatedAt: new Date(b.updatedAt),
            })),
          });
        }

        if (categories.length) {
          await tx.category.createMany({
            data: categories.map(c => ({
              id: c.id,
              name: c.name,
              type: c.type,
              color: c.color,
              icon: c.icon ?? null,
              spaceId: c.spaceId ?? null,
              createdAt: new Date(c.createdAt),
              updatedAt: new Date(c.updatedAt),
            })),
          });
        }

        if (objectives.length) {
          await tx.objective.createMany({
            data: objectives.map(o => ({
              id: o.id,
              title: o.title,
              description: o.description ?? null,
              targetAmount: o.targetAmount,
              deadline: d(o.deadline),
              isCompleted: o.isCompleted,
              archived: o.archived ?? false,
              spaceId: o.spaceId ?? null,
              createdAt: new Date(o.createdAt),
              updatedAt: new Date(o.updatedAt),
            })),
          });
        }

        if (categoryKeywords.length) {
          await tx.categoryKeyword.createMany({
            data: categoryKeywords.map(ck => ({
              id: ck.id,
              value: ck.value,
              categoryId: ck.categoryId,
            })),
          });
        }

        if (transactions.length) {
          await tx.transaction.createMany({
            data: transactions.map(t => ({
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
            })),
          });
        }

        if (budgets.length) {
          await tx.budget.createMany({
            data: budgets.map(b => ({
              id: b.id,
              amount: b.amount,
              period: b.period,
              startDate: new Date(b.startDate),
              spaceId: b.spaceId ?? null,
              bankId: b.bankId ?? null,
              categoryId: b.categoryId,
              createdAt: new Date(b.createdAt),
              updatedAt: new Date(b.updatedAt),
            })),
          });
        }

        if (recurrences.length) {
          await tx.recurrence.createMany({
            data: recurrences.map(r => ({
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
            })),
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
    res.status(500).json({ error: "Impossible d’enregistrer la configuration locale." });
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
