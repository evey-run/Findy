import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../prisma';
import { getPublicBaseUrl } from '../publicUrl';
import { initialBalanceFor } from '../lib/balance';

const router = express.Router();
const EB_BASE = 'https://api.enablebanking.com';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYNC_SETTINGS_PATH = path.resolve(__dirname, '..', '..', '..', 'data', 'sync-settings.json');

// ─── Credential resolution: env vars → sync-settings.json ──
function readSyncSettings(): Record<string, any> {
  try {
    if (!fs.existsSync(SYNC_SETTINGS_PATH)) return {};
    return JSON.parse(fs.readFileSync(SYNC_SETTINGS_PATH, 'utf-8'));
  } catch { return {}; }
}

function getEBCredentials(): { appId: string; privateKey: string } {
  // 1. Try env vars first
  const envAppId = process.env.ENABLE_BANKING_APP_ID;
  const envKey = process.env.ENABLE_BANKING_RSA_KEY;
  if (envAppId && envKey) return { appId: envAppId, privateKey: envKey };

  // 2. Fallback to sync-settings.json
  const settings = readSyncSettings();
  const eb = settings.enablebanking;
  if (eb?.appId && eb?.privateKey) {
    return { appId: eb.appId, privateKey: eb.privateKey };
  }

  throw new Error('Enable Banking credentials not configured. Configure them in Settings or set ENABLE_BANKING_APP_ID / ENABLE_BANKING_RSA_KEY');
}

const MANUAL_SYNC_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const AUTO_SYNC_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

// ─── JWT Auth ──────────────────────────────────────────────
let jwtCache: { token: string; expiresAt: number } | null = null;

function buildJWT(): string {
  const { appId, privateKey: privateKeyStr } = getEBCredentials();

  // Normalize PEM key: handle single-line, escaped newlines, spaces between markers
  let privateKey = privateKeyStr
    .replace(/\\n/g, '\n')        // unescape \n
    .replace(/\r/g, '')           // remove \r
    .trim();

  // Extract key body between BEGIN/END markers
  const beginMatch = privateKey.match(/-----BEGIN [A-Z ]+-----/);
  const endMatch = privateKey.match(/-----END [A-Z ]+-----/);
  if (beginMatch && endMatch) {
    const begin = beginMatch[0];
    const end = endMatch[0];
    const body = privateKey
      .slice(privateKey.indexOf(begin) + begin.length, privateKey.indexOf(end))
      .replace(/\s+/g, ''); // strip all whitespace from body
    // Re-wrap to 64-char lines
    const wrapped = body.match(/.{1,64}/g)?.join('\n') || body;
    privateKey = `${begin}\n${wrapped}\n${end}`;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3599;
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');
  return `${header}.${payload}.${signature}`;
}

function getJWT(): string {
  if (jwtCache && jwtCache.expiresAt > Date.now() + 60_000) return jwtCache.token;
  const token = buildJWT();
  jwtCache = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token;
}

async function ebFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getJWT();
  const res = await fetch(`${EB_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as any),
    },
  });
  if (!res.ok) throw new Error(`Enable Banking ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Helpers ───────────────────────────────────────────────

function hashTransactionFallback(date: string, amount: number, description: string): string {
  return crypto.createHash('sha256').update(`${date}|${amount}|${description}`).digest('hex').slice(0, 32);
}

interface NormalizedTransaction {
  externalId: string;
  amount: number;
  date: Date;
  description: string;
  currency: string | null;
  balanceAfterTransaction: number | null;
  status: 'BOOK' | 'PENDING';
}

function normalizeTransaction(t: any): NormalizedTransaction | null {
  const rawId = t.entry_reference ?? t.transaction_id;
  const rawAmount = parseFloat(t.transaction_amount?.amount ?? t.amount ?? '0');
  const amount = t.credit_debit_indicator === 'CRDT' ? rawAmount : -rawAmount;
  const date = new Date(t.booking_date ?? t.transaction_date ?? t.value_date ?? new Date());
  const description =
    (Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : t.remittance_information) ??
    t.creditor?.name ??
    t.debtor?.name ??
    'Transaction';

  // PSD2: transactions can be BOOK (settled) or PENDING (not yet settled)
  const status: 'BOOK' | 'PENDING' = t.booking_date ? 'BOOK' : 'PENDING';

  // Build externalId: use API id if available, otherwise hash fallback
  const externalId = rawId || hashTransactionFallback(date.toISOString(), amount, description);
  if (!externalId) return null;

  const currency = t.transaction_amount?.currency ?? null;

  const balAfter = t.balance_after_transaction?.amount;
  const balanceAfterTransaction = balAfter != null ? parseFloat(balAfter) : null;

  return { externalId, amount, date, description, currency, balanceAfterTransaction, status };
}

async function fetchAllTransactions(accountUid: string, dateFrom?: string): Promise<any[]> {
  let allTransactions: any[] = [];
  let continuationKey: string | null = null;

  do {
    const params = new URLSearchParams();
    if (continuationKey) params.set('continuation_key', continuationKey);
    if (dateFrom) params.set('date_from', dateFrom);

    const qs = params.toString();
    const url = `/accounts/${accountUid}/transactions${qs ? `?${qs}` : ''}`;
    const data = await ebFetch(url);
    allTransactions = allTransactions.concat(data.transactions || []);
    continuationKey = data.continuation_key ?? null;
  } while (continuationKey);

  console.log(`[EB] Total transactions fetched: ${allTransactions.length}`);
  return allTransactions;
}

// ─── Error helpers ─────────────────────────────────────────

function isAccountError(err: any): boolean {
  const msg = err?.message || '';
  return msg.includes('ACCOUNT_DOES_NOT_EXIST') || msg.includes('404');
}

async function markBankExpired(bankId: string): Promise<void> {
  console.log(`[Sync] Marking bank ${bankId} as EXPIRED (session/account invalid)`);
  await prisma.bank.update({
    where: { id: bankId },
    data: { ebStatus: 'EXPIRED', ebSessionId: null, ebAccountUid: null },
  });
}

// ─── Sync Core ─────────────────────────────────────────────

export interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  pendingReconciled: number;
  total: number;
  consentWarning: string | null;
}

/**
 * Backfill: fetch all available history (typically 90 days PSD2).
 * Called once when the user first links a bank account.
 */
export async function syncBackfill(bankId: string): Promise<SyncResult> {
  const bank = await prisma.bank.findUnique({ where: { id: bankId } });
  if (!bank?.ebAccountUid) throw new Error('Bank not linked');

  console.log(`[EB] Backfill start for ${bank.name} (accountUid: ${bank.ebAccountUid})`);

  try {
    // Fetch real account balance from EB (only during backfill)
    let ebBalance: number | null = null;
    try {
      const balancesData = await ebFetch(`/accounts/${bank.ebAccountUid}/balances`);
      const balances = balancesData.balances || [];
      const closing = balances.find((b: any) => b.balance_type === 'CLBD') || balances[0];
      if (closing?.balance_amount) {
        ebBalance = parseFloat(closing.balance_amount.amount);
        console.log(`[EB] Real balance from API: ${ebBalance}`);
      }
    } catch (e: any) {
      console.error(`[EB] Balance fetch failed:`, e.message);
    }

    // Fetch transactions with explicit date range (PSD2 allows up to 90 days)
    const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    console.log(`[EB] Fetching transactions from ${dateFrom}`);
    const rawTransactions = await fetchAllTransactions(bank.ebAccountUid, dateFrom);
    console.log(`[EB] Backfill: ${rawTransactions.length} raw transactions`);
    const result = await upsertTransactions(bankId, rawTransactions);

    // Cale bank.balance pour que le solde affiché tombe sur le solde réel.
    // On inverse exactement la formule d'affichage (cf. lib/balance.ts) : la
    // somme brute des mouvements ne convient pas aux comptes d'investissement,
    // dont les achats comptent positivement.
    if (ebBalance != null) {
      const [assetSum, cashSum] = await Promise.all([
        prisma.transaction.aggregate({
          where: { bankId, quantity: { not: null } },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { bankId, quantity: null },
          _sum: { amount: true },
        }),
      ]);
      const inputs = {
        assetFlow: assetSum._sum.amount ?? 0,
        cashFlow: cashSum._sum.amount ?? 0,
      };
      const initialBalance = initialBalanceFor(bank.accountType, ebBalance, inputs);
      await prisma.bank.update({ where: { id: bankId }, data: { balance: initialBalance } });
      console.log(`[EB] Calibrated: ebBalance=${ebBalance} → initialBalance=${initialBalance}`);
    }

    return result;
  } catch (err: any) {
    console.error(`[EB] Backfill error for ${bank.name}:`, err.message);
    if (isAccountError(err)) {
      await markBankExpired(bankId);
      throw new Error('SESSION_EXPIRED');
    }
    throw err;
  }
}

/**
 * Incremental sync: fetch only the delta since last known transaction.
 * Called by cron, app launch, and manual refresh.
 */
export async function syncIncremental(bankId: string): Promise<SyncResult> {
  const bank = await prisma.bank.findUnique({ where: { id: bankId } });
  if (!bank?.ebAccountUid) throw new Error('Bank not linked');

  // Find the most recent transaction date for this bank to use as date_from
  const lastTx = await prisma.transaction.findFirst({
    where: { bankId, externalId: { not: null } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  // Request transactions from 1 day before last known (overlap for PENDING→BOOK reconciliation)
  const dateFrom = lastTx
    ? new Date(lastTx.date.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : undefined;

  let rawTransactions: any[];
  try {
    rawTransactions = await fetchAllTransactions(bank.ebAccountUid, dateFrom);
  } catch (err: any) {
    if (isAccountError(err)) {
      await markBankExpired(bankId);
      throw new Error('SESSION_EXPIRED');
    }
    throw err;
  }

  const result = await upsertTransactions(bankId, rawTransactions);

  // Update last sync timestamp
  await prisma.bank.update({
    where: { id: bankId },
    data: { ebLastSyncAt: new Date() },
  });

  // Check consent expiration
  result.consentWarning = checkConsentExpiration(bank);

  return result;
}

/**
 * Shared upsert logic: deduplicate, insert new txs, reconcile PENDING→BOOK.
 */
async function upsertTransactions(bankId: string, rawTransactions: any[]): Promise<SyncResult> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let pendingReconciled = 0;

  // Pre-fetch existing transactions for this bank for batch dedup
  const existingTxs = await prisma.transaction.findMany({
    where: { bankId, externalId: { not: null } },
    select: { id: true, externalId: true, status: true, balanceAfterTransaction: true },
  });
  const existingByExternalId = new Map(existingTxs.map((t) => [t.externalId!, t]));

  // Batch inserts for performance
  const toCreate: Array<{
    bankId: string;
    amount: number;
    description: string;
    date: Date;
    externalId: string;
    currency: string | null;
    balanceAfterTransaction: number | null;
    status: string;
  }> = [];
  const toUpdate: Array<{ id: string; status?: string; balanceAfterTransaction?: number | null }> = [];

  for (const raw of rawTransactions) {
    const normalized = normalizeTransaction(raw);
    if (!normalized) continue;

    const existing = existingByExternalId.get(normalized.externalId);

    if (existing) {
      // Reconcile: PENDING → BOOK transition
      if (existing.status === 'PENDING' && normalized.status === 'BOOK') {
        toUpdate.push({ id: existing.id, status: 'BOOK' });
        pendingReconciled++;
      }
      // Backfill balanceAfterTransaction if missing
      if (existing.balanceAfterTransaction == null && normalized.balanceAfterTransaction != null) {
        toUpdate.push({ id: existing.id, balanceAfterTransaction: normalized.balanceAfterTransaction });
      }
      skipped++;
      continue;
    }

    toCreate.push({
      bankId,
      amount: normalized.amount,
      description: normalized.description,
      date: normalized.date,
      externalId: normalized.externalId,
      currency: normalized.currency,
      balanceAfterTransaction: normalized.balanceAfterTransaction,
      status: normalized.status,
    });
  }

  // Execute batch create
  if (toCreate.length > 0) {
    try {
      await prisma.transaction.createMany({ data: toCreate });
    } catch (err: any) {
      // If batch fails (e.g. unique constraint), insert one by one
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        for (const tx of toCreate) {
          try {
            await prisma.transaction.create({ data: tx });
          } catch { /* skip duplicate */ }
        }
      } else throw err;
    }
    imported = toCreate.length;
  }

  // Execute batch status updates (PENDING → BOOK, balanceAfterTransaction backfill)
  for (const u of toUpdate) {
    const data: any = {};
    if (u.status) data.status = u.status;
    if (u.balanceAfterTransaction != null) data.balanceAfterTransaction = u.balanceAfterTransaction;
    await prisma.transaction.update({ where: { id: u.id }, data });
  }

  return {
    imported,
    updated,
    skipped,
    pendingReconciled,
    total: rawTransactions.length,
    consentWarning: null,
  };
}

/**
 * Check if consent is expiring soon (within 7 days).
 */
function checkConsentExpiration(bank: {
  ebExpiresAt: Date | null;
  ebStatus: string | null;
  name: string;
}): string | null {
  if (bank.ebStatus !== 'LINKED' || !bank.ebExpiresAt) return null;

  const daysUntilExpiry = Math.ceil(
    (bank.ebExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  if (daysUntilExpiry <= 0) {
    return `Le consentement de ${bank.name} a expiré. Veuillez réauthentifier.`;
  }
  if (daysUntilExpiry <= 7) {
    return `Le consentement de ${bank.name} expire dans ${daysUntilExpiry} jour(s). Réauthentifiez bientôt.`;
  }
  return null;
}

// ─── Manual Sync Cooldown ──────────────────────────────────
const manualSyncTimestamps = new Map<string, number>();

function canManualSync(bankId: string): { allowed: boolean; retryAfterMs?: number } {
  const lastSync = manualSyncTimestamps.get(bankId);
  if (!lastSync) return { allowed: true };
  const elapsed = Date.now() - lastSync;
  if (elapsed >= MANUAL_SYNC_COOLDOWN_MS) return { allowed: true };
  return { allowed: false, retryAfterMs: MANUAL_SYNC_COOLDOWN_MS - elapsed };
}

function recordManualSync(bankId: string): void {
  manualSyncTimestamps.set(bankId, Date.now());
}

// ─── Routes ────────────────────────────────────────────────

// GET /api/enablebanking/configured
router.get('/configured', (_req, res) => {
  try {
    getEBCredentials();
    res.json({ configured: true });
  } catch {
    res.json({ configured: false });
  }
});

// GET /api/enablebanking/aspsps?country=fr
router.get('/aspsps', async (req, res) => {
  try {
    const country = ((req.query.country as string) || 'FR').toUpperCase();
    const data = await ebFetch(`/aspsps?country=${country}`);
    const aspsps = data.aspsps ?? data;
    const formatted = Array.isArray(aspsps) ? aspsps.map((a: any) => ({
      name: a.name || a.aspsp_name || '',
      country: a.country || country.toUpperCase(),
      logo: a.logo || a.logoUrl || '',
    })) : [];
    res.json(formatted);
  } catch (err: any) {
    console.error('Enable Banking fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enablebanking/link — Body: { bankId, aspspName, aspspCountry }
router.post('/link', async (req, res) => {
  try {
    const { bankId, aspspName, aspspCountry } = req.body;
    if (!bankId || !aspspName || !aspspCountry) {
      return res.status(400).json({ error: 'bankId, aspspName and aspspCountry required' });
    }

    const state = crypto.randomUUID();
    const baseUrl = getPublicBaseUrl();
    const callbackUrl = `${baseUrl}/api/enablebanking/callback`;
    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const authData = await ebFetch('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: { name: aspspName, country: aspspCountry.toUpperCase() },
        state,
        redirect_url: callbackUrl,
        psu_type: 'personal',
      }),
    });

    await prisma.bank.update({
      where: { id: bankId },
      data: {
        ebAspspName: aspspName,
        ebAspspCountry: aspspCountry.toUpperCase(),
        ebState: state,
        ebStatus: 'PENDING',
        ebSessionId: null,
        ebAccountUid: null,
        ebLinkedAt: null,
        ebExpiresAt: null,
      },
    });

    const redirectLink = `${baseUrl}/api/enablebanking-redirect?${new URLSearchParams({
      bankId,
      aspspName: aspspName.toUpperCase(),
      aspspCountry: aspspCountry.toUpperCase(),
      redirectUrl: authData.url,
    }).toString()}`;

    res.json({ link: authData.url, redirectLink });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/enablebanking/callback?code=...&state=...
router.get('/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const html = (body: string) =>
    `<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#fff}h2{color:#7c3aed}</style></head><body>${body}</body></html>`;

  if (!code || !state) return res.send(html('<h2>Erreur</h2><p>Paramètres manquants.</p>'));

  try {
    const bank = await prisma.bank.findFirst({ where: { ebState: state } });
    if (!bank) return res.send(html('<h2>Erreur</h2><p>Portefeuille introuvable pour cette connexion.</p>'));

    const sessionData = await ebFetch('/sessions', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    const sessionId: string = sessionData.session_id;
    const firstAccount = sessionData.accounts?.[0];
    const accountUid: string = firstAccount?.uid ?? firstAccount;

    const now = new Date();
    await prisma.bank.update({
      where: { id: bank.id },
      data: {
        ebSessionId: sessionId,
        ebAccountUid: accountUid,
        ebStatus: 'LINKED',
        ebLinkedAt: now,
        ebExpiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    // Trigger backfill immediately after successful link (background, don't block response)
    syncBackfill(bank.id)
      .then((result) => {
        console.log(`[EB] Backfill completed for ${bank.name}: ${result.imported} imported, ${result.skipped} skipped`);
      })
      .catch((err) => {
        console.error(`[EB] Backfill failed for ${bank.name}:`, err.message);
      });

    res.send(html(`
      <div style="max-width:420px;margin:0 auto">
        <div style="font-size:56px;margin-bottom:16px">✅</div>
        <h2>Compte lié avec succès !</h2>
        <p style="color:#a0aec0"><strong style="color:#fff">${bank.name}</strong> est maintenant connecté à Enable Banking.</p>
        <p style="color:#a0aec0">Les transactions sont synchronisées automatiquement.</p>
        <script>setTimeout(()=>window.close(),4000)</script>
      </div>
    `));
  } catch (err: any) {
    res.send(html(`<h2>Erreur</h2><p>${err.message}</p>`));
  }
});

// GET /api/enablebanking/banks/:bankId/status
router.get('/banks/:bankId/status', async (req, res) => {
  try {
    const bank = await prisma.bank.findUnique({
      where: { id: req.params.bankId },
      select: {
        ebStatus: true,
        ebLinkedAt: true,
        ebExpiresAt: true,
        ebLastSyncAt: true,
        ebAspspName: true,
        name: true,
      },
    });
    if (!bank) return res.status(404).json({ error: 'Bank not found' });

    const consentWarning = checkConsentExpiration(bank);
    const isExpired = bank.ebExpiresAt && bank.ebExpiresAt.getTime() < Date.now();

    res.json({
      ebStatus: bank.ebStatus,
      ebLinkedAt: bank.ebLinkedAt,
      ebExpiresAt: bank.ebExpiresAt,
      ebLastSyncAt: bank.ebLastSyncAt,
      ebAspspName: bank.ebAspspName,
      consentWarning,
      isExpired,
      consentDaysRemaining: bank.ebExpiresAt
        ? Math.max(0, Math.ceil((bank.ebExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enablebanking/banks/:bankId/sync — Smart sync (incremental)
router.post('/banks/:bankId/sync', async (req, res) => {
  try {
    const bank = await prisma.bank.findUnique({ where: { id: req.params.bankId } });
    if (!bank) return res.status(404).json({ error: 'Bank not found' });
    if (!bank.ebAccountUid) return res.status(400).json({ error: 'Bank not linked to Enable Banking' });
    if (bank.ebStatus !== 'LINKED') return res.status(400).json({ error: 'Consent not active' });

    // Check consent expiration
    if (bank.ebExpiresAt && bank.ebExpiresAt.getTime() < Date.now()) {
      return res.status(403).json({ error: 'CONSENT_EXPIRED', message: 'Le consentement a expiré. Réauthentifiez votre compte bancaire.' });
    }

    // Determine if this is a backfill (no transactions yet) or incremental
    const txCount = await prisma.transaction.count({ where: { bankId: bank.id } });
    let result;
    try {
      result = txCount === 0
        ? await syncBackfill(bank.id)
        : await syncIncremental(bank.id);
    } catch (err: any) {
      if (err.message === 'SESSION_EXPIRED') {
        return res.status(403).json({ error: 'SESSION_EXPIRED', message: 'Session expirée. Réauthentifiez votre compte bancaire via « Lier ».' });
      }
      throw err;
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enablebanking/banks/:bankId/sync-manual — Manual refresh with cooldown
router.post('/banks/:bankId/sync-manual', async (req, res) => {
  try {
    const bank = await prisma.bank.findUnique({ where: { id: req.params.bankId } });
    if (!bank) return res.status(404).json({ error: 'Bank not found' });
    if (!bank.ebAccountUid) return res.status(400).json({ error: 'Bank not linked' });
    if (bank.ebStatus !== 'LINKED') return res.status(400).json({ error: 'Consent not active' });

    // Check consent expiration
    if (bank.ebExpiresAt && bank.ebExpiresAt.getTime() < Date.now()) {
      return res.status(403).json({ error: 'CONSENT_EXPIRED', message: 'Le consentement a expiré. Réauthentifiez votre compte bancaire.' });
    }

    // Check cooldown
    const cooldown = canManualSync(bank.id);
    if (!cooldown.allowed) {
      return res.status(429).json({
        error: 'COOLDOWN',
        message: `Patientez ${Math.ceil(cooldown.retryAfterMs! / 1000)}s avant de resynchroniser.`,
        retryAfterMs: cooldown.retryAfterMs,
      });
    }

    recordManualSync(bank.id);

    const txCount = await prisma.transaction.count({ where: { bankId: bank.id } });
    let result;
    try {
      result = txCount === 0
        ? await syncBackfill(bank.id)
        : await syncIncremental(bank.id);
    } catch (err: any) {
      if (err.message === 'SESSION_EXPIRED') {
        return res.status(403).json({ error: 'SESSION_EXPIRED', message: 'Session expirée. Réauthentifiez votre compte bancaire via « Lier ».' });
      }
      throw err;
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/enablebanking/banks/:bankId/unlink
router.delete('/banks/:bankId/unlink', async (req, res) => {
  try {
    await prisma.bank.update({
      where: { id: req.params.bankId },
      data: {
        ebAspspName: null,
        ebAspspCountry: null,
        ebState: null,
        ebSessionId: null,
        ebAccountUid: null,
        ebStatus: null,
        ebLinkedAt: null,
        ebExpiresAt: null,
        ebLastSyncAt: null,
      },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Background Sync (exported for cron) ───────────────────

/**
 * Sync all LINKED banks. Called by the background scheduler.
 * Returns summary of all sync results.
 */
export async function syncAllBanks(): Promise<Array<{ bankId: string; bankName: string; result: SyncResult | null; error: string | null }>> {
  const linkedBanks = await prisma.bank.findMany({
    where: { ebStatus: 'LINKED', ebAccountUid: { not: null } },
    select: { id: true, name: true, ebExpiresAt: true },
  });

  const results: Array<{ bankId: string; bankName: string; result: SyncResult | null; error: string | null }> = [];

  for (const bank of linkedBanks) {
    // Skip banks with expired consent
    if (bank.ebExpiresAt && bank.ebExpiresAt.getTime() < Date.now()) {
      results.push({ bankId: bank.id, bankName: bank.name, result: null, error: 'CONSENT_EXPIRED' });
      continue;
    }

    try {
      const txCount = await prisma.transaction.count({ where: { bankId: bank.id } });
      const result = txCount === 0
        ? await syncBackfill(bank.id)
        : await syncIncremental(bank.id);
      results.push({ bankId: bank.id, bankName: bank.name, result, error: null });
    } catch (err: any) {
      results.push({ bankId: bank.id, bankName: bank.name, result: null, error: err.message });
    }
  }

  return results;
}

/**
 * Get all consent expiring soon (within 7 days) for proactive warning.
 */
export async function getExpiringConsents(): Promise<Array<{ bankId: string; bankName: string; daysRemaining: number }>> {
  const linkedBanks = await prisma.bank.findMany({
    where: { ebStatus: 'LINKED', ebExpiresAt: { not: null } },
    select: { id: true, name: true, ebExpiresAt: true },
  });

  return linkedBanks
    .filter((b) => b.ebExpiresAt !== null)
    .map((b) => ({
      bankId: b.id,
      bankName: b.name,
      daysRemaining: Math.ceil((b.ebExpiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    }))
    .filter((c) => c.daysRemaining <= 7 && c.daysRemaining > 0);
}

export default router;
