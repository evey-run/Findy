import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import prisma from '../prisma';
import { getPublicBaseUrl } from '../publicUrl';
import { initialBalanceFor } from '../lib/balance';
import path from 'node:path';
import { SYNC_SETTINGS_PATH, PERSISTENCE_DIR, ensurePersistenceDir } from '../lib/persistence';
import { ensureTunnel, keepTunnelWarm } from '../lib/tunnel';
import { consentWarning, normalizeTransaction, planReconciliation } from '../lib/ebTransactions';

const router = express.Router();
const EB_BASE = 'https://api.enablebanking.com';

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

/**
 * Vérifie que l'URL de retour est bien déclarée dans l'application Enable
 * Banking. `registered: null` = impossible de savoir (API injoignable), auquel
 * cas on laisse passer : mieux vaut un parcours qui tente sa chance qu'un
 * blocage sur un diagnostic incertain.
 */
async function checkRedirectRegistered(callbackUrl: string): Promise<{ registered: boolean | null; urls: string[] }> {
  try {
    const application = await ebFetch('/application');
    const urls: string[] = Array.isArray(application?.redirect_urls)
      ? application.redirect_urls.filter((url: unknown): url is string => typeof url === 'string')
      : [];
    if (urls.length === 0) return { registered: null, urls };

    const normalize = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();
    return { registered: urls.some((url) => normalize(url) === normalize(callbackUrl)), urls };
  } catch (error) {
    console.warn('[EB] Lecture de l’application impossible, vérification du callback ignorée:', error);
    return { registered: null, urls: [] };
  }
}

interface EbAccountChoice {
  uid: string;
  name: string;
  kind: string;
  identifiers: string[];
  description: string | null;
}

function accountUid(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;

  // Selon l'ASPSP et la version d'API, l'identifiant technique du compte
  // n'arrive pas toujours sous la même clé.
  const record = value as Record<string, unknown>;
  for (const key of ['uid', 'account_uid', 'accountUid', 'resource_id', 'resourceId', 'id']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

/** Les deux formats sont documentés par Enable Banking selon la version d'API. */
function sessionAccountUids(sessionData: any): string[] {
  const accounts = [
    ...(Array.isArray(sessionData?.accounts) ? sessionData.accounts : []),
    ...(Array.isArray(sessionData?.accounts_data) ? sessionData.accounts_data : []),
  ];

  return [...new Set(accounts.map(accountUid).filter((uid): uid is string => uid !== null))];
}

function sessionStatus(sessionData: any): string | null {
  return nonEmptyString(sessionData?.status) ?? nonEmptyString(sessionData?.session_status);
}

/**
 * Certains ASPSP (Revolut notamment) renvoient une session sans comptes juste
 * après l'échange du code : la liste n'est publiée qu'une fois le consentement
 * propagé côté banque. On relit alors la session avant d'abandonner.
 */
async function resolveSessionAccounts(sessionId: string, sessionData: any): Promise<{ data: any; uids: string[]; attempts: any[] }> {
  let data = sessionData;
  let uids = sessionAccountUids(data);
  const attempts: any[] = [{ source: 'POST /sessions', payload: data }];
  if (uids.length > 0 || !sessionId) return { data, uids, attempts };

  for (const delayMs of [1000, 3000, 6000]) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      data = await ebFetch(`/sessions/${encodeURIComponent(sessionId)}`);
      attempts.push({ source: `GET /sessions/{id} (+${delayMs}ms)`, payload: data });
    } catch (error: any) {
      console.warn(`[EB] Relecture de la session ${sessionId} impossible:`, error);
      attempts.push({ source: `GET /sessions/{id} (+${delayMs}ms)`, error: String(error?.message ?? error) });
      break;
    }
    uids = sessionAccountUids(data);
    if (uids.length > 0) break;
  }

  return { data, uids, attempts };
}

/**
 * Trace de secours pour la liaison bancaire : dans l'app packagée, la sortie du
 * sidecar est jetée, donc le payload d'Enable Banking n'existe nulle part.
 */
function writeEbDebug(label: string, payload: unknown): string | null {
  try {
    ensurePersistenceDir();
    const file = path.join(PERSISTENCE_DIR, 'enablebanking-debug.json');
    // Ce fichier contient des identifiants de comptes bancaires : mêmes
    // permissions restreintes que les identifiants de synchronisation.
    fs.writeFileSync(
      file,
      JSON.stringify({ at: new Date().toISOString(), label, payload }, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
    fs.chmodSync(file, 0o600);
    return file;
  } catch (error) {
    console.warn('[EB] Impossible d’écrire le fichier de diagnostic:', error);
    return null;
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function identifierLabel(scheme: unknown): string {
  const normalized = nonEmptyString(scheme)?.toUpperCase() || '';
  if (normalized.includes('IBAN')) return 'IBAN';
  if (normalized.includes('PAN') || normalized.includes('CARD')) return 'Carte';
  if (normalized.includes('BBAN')) return 'Compte';
  return normalized ? `Réf. ${normalized}` : 'Référence';
}

function addMaskedIdentifier(identifiers: string[], label: string, value: unknown): void {
  const raw = nonEmptyString(value);
  if (!raw) return;

  const compact = raw.replace(/\s/g, '');
  const display = compact.length > 4 ? `${label} ••••${compact.slice(-4)}` : `${label} masqué`;
  if (!identifiers.includes(display)) identifiers.push(display);
}

function accountIdentifiers(details: any): string[] {
  const identifiers: string[] = [];
  const accountId = asRecord(details?.account_id);

  addMaskedIdentifier(identifiers, 'IBAN', accountId?.iban ?? details?.iban);
  addMaskedIdentifier(identifiers, 'Carte', accountId?.masked_pan ?? accountId?.pan ?? accountId?.card_number);

  const identifiedAccounts = [
    ...(Array.isArray(details?.all_account_ids) ? details.all_account_ids : []),
    ...(Array.isArray(details?.identifications) ? details.identifications : []),
  ];
  for (const item of identifiedAccounts) {
    const identifier = asRecord(item);
    if (!identifier) continue;
    addMaskedIdentifier(
      identifiers,
      identifierLabel(identifier.scheme_name ?? identifier.schemeName),
      identifier.identification ?? identifier.value,
    );
  }

  const other = asRecord(accountId?.other);
  if (other) {
    addMaskedIdentifier(
      identifiers,
      identifierLabel(other.scheme_name ?? other.schemeName),
      other.identification,
    );
  }

  return identifiers;
}

function accountKind(details: any, identifiers: string[]): string {
  const kindCode = nonEmptyString(details?.cash_account_type)?.toUpperCase();
  const labels: Record<string, string> = {
    CACC: 'Compte courant',
    CASH: 'Compte espèces',
    CARD: 'Carte',
    SVGS: 'Épargne',
  };
  if (kindCode && labels[kindCode]) return labels[kindCode];
  if (identifiers.some((identifier) => identifier.startsWith('Carte '))) return 'Carte';
  return kindCode ? `Compte (${kindCode})` : 'Compte';
}

function accountDescription(details: any, name: string): string | null {
  const values = [details?.product, details?.details, details?.currency]
    .map(nonEmptyString)
    .filter((value): value is string => Boolean(value) && value !== name);
  return [...new Set(values)].join(' · ') || null;
}

async function describeSessionAccounts(accountUids: string[]): Promise<EbAccountChoice[]> {
  return Promise.all(accountUids.map(async (uid, index) => {
    try {
      const details = await ebFetch(`/accounts/${encodeURIComponent(uid)}/details`);
      const identifiers = accountIdentifiers(details);
      const kind = accountKind(details, identifiers);
      const name = [details.name, details.product, details.details]
        .map(nonEmptyString)
        .find((value): value is string => Boolean(value)) || `Compte ${index + 1}`;
      return {
        uid,
        name,
        kind,
        identifiers: identifiers.length ? identifiers : [`Référence ••••${uid.slice(-6)}`],
        description: accountDescription(details, name),
      };
    } catch (error) {
      // Un ASPSP peut accepter la session mais ne pas fournir les détails. Le
      // choix reste possible grâce à un identifiant de compte raccourci.
      console.warn(`[EB] Impossible de lire les détails du compte ${uid}:`, error);
      return {
        uid,
        name: `Compte ${index + 1}`,
        kind: 'Compte',
        identifiers: [`Référence ••••${uid.slice(-6)}`],
        description: null,
      };
    }
  }));
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function callbackHtml(body: string): string {
  return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:48px 20px;background:#111;color:#fff}
    h2{color:#a78bfa;margin:0 0 12px}.panel{max-width:480px;margin:0 auto}.account{width:100%;text-align:left;margin:10px 0;padding:16px;border:1px solid #3f3f46;border-radius:12px;background:#18181b;color:#fff;cursor:pointer}.account:hover{border-color:#8b5cf6;background:#27272a}.account-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.account strong{font-size:15px}.account .kind{display:inline-block;flex-shrink:0;padding:3px 7px;border-radius:99px;background:#27272a;color:#c4b5fd;font-size:11px}.account .identifier{display:block;margin-top:7px;font-size:13px;color:#e4e4e7}.account .description{display:block;margin-top:5px;font-size:12px;color:#a1a1aa}
  </style></head><body>${body}</body></html>`;
}

function linkedAccountHtml(bankName: string): string {
  return callbackHtml(`
    <div class="panel">
      <div style="font-size:56px;margin-bottom:16px">✅</div>
      <h2>Compte lié avec succès !</h2>
      <p style="color:#a0aec0"><strong style="color:#fff">${escapeHtml(bankName)}</strong> est maintenant connecté à Enable Banking.</p>
      <p style="color:#a0aec0">Les transactions sont synchronisées automatiquement.</p>
      <script>setTimeout(()=>window.close(),4000)</script>
    </div>
  `);
}

function selectAccountHtml(bankId: string, state: string, bankName: string, accounts: EbAccountChoice[]): string {
  const action = `${getPublicBaseUrl()}/api/enablebanking/select-account`;
  const choices = accounts.map((account) => `
    <form method="post" action="${escapeHtml(action)}">
      <input type="hidden" name="bankId" value="${escapeHtml(bankId)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <input type="hidden" name="accountUid" value="${escapeHtml(account.uid)}">
      <button class="account" type="submit">
        <span class="account-head"><strong>${escapeHtml(account.name)}</strong><span class="kind">${escapeHtml(account.kind)}</span></span>
        ${account.identifiers.map((identifier) => `<span class="identifier">${escapeHtml(identifier)}</span>`).join('')}
        ${account.description ? `<span class="description">${escapeHtml(account.description)}</span>` : ''}
      </button>
    </form>
  `).join('');

  return callbackHtml(`
    <div class="panel">
      <div style="font-size:48px;margin-bottom:16px">🏦</div>
      <h2>Choisis le compte à synchroniser</h2>
      <p style="color:#a0aec0;margin-bottom:22px">Boursobank a autorisé plusieurs comptes pour <strong style="color:#fff">${escapeHtml(bankName)}</strong>. Choisis celui qui correspond à ce portefeuille Findy.</p>
      ${choices}
      <p style="color:#a1a1aa;font-size:12px;margin-top:18px">« IBAN » identifie le compte. « Carte » désigne une carte transmise par la banque. Les numéros sont volontairement masqués.</p>
      <p style="color:#71717a;font-size:12px;margin-top:18px">Les opérations déjà importées depuis un ancien compte ne sont pas supprimées automatiquement.</p>
    </div>
  `);
}

async function linkSelectedAccount(bankId: string, sessionId: string, accountUid: string) {
  const now = new Date();
  const bank = await prisma.bank.update({
    where: { id: bankId },
    data: {
      ebState: null,
      ebSessionId: sessionId,
      ebAccountUid: accountUid,
      ebStatus: 'LINKED',
      ebLinkedAt: now,
      ebExpiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      ebLastSyncAt: null,
    },
  });

  // Le backfill ne commence qu'après le choix : les opérations d'un autre
  // compte Boursobank ne peuvent plus être importées par défaut.
  syncBackfill(bank.id)
    .then((result) => {
      console.log(`[EB] Backfill completed for ${bank.name}: ${result.imported} imported, ${result.skipped} skipped`);
    })
    .catch((err) => {
      console.error(`[EB] Backfill failed for ${bank.name}:`, err.message);
    });

  return bank;
}

/**
 * Stratégie de récupération côté Enable Banking.
 * - `default` : fenêtre classique (à partir de `date_from`), idéale pour le delta.
 * - `longest` : remonte jusqu'à l'opération la plus ancienne accessible et tire
 *   tout l'historique. `date_from` n'est alors qu'une suggestion de point de
 *   départ ; omis, EB détermine lui-même la plus ancienne opération.
 */
type TransactionsFetchStrategy = 'default' | 'longest';

async function fetchAllTransactions(
  accountUid: string,
  opts: { dateFrom?: string; strategy?: TransactionsFetchStrategy } = {},
): Promise<any[]> {
  const { dateFrom, strategy } = opts;
  let allTransactions: any[] = [];
  let continuationKey: string | null = null;

  do {
    const params = new URLSearchParams();
    if (continuationKey) params.set('continuation_key', continuationKey);
    if (dateFrom) params.set('date_from', dateFrom);
    if (strategy) params.set('strategy', strategy);

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
 * Backfill : récupère TOUT l'historique disponible (souvent 1 à 2 ans, parfois
 * plus), pas seulement les 90 derniers jours. Appelé une seule fois, juste
 * après la liaison du compte — c'est la seule fenêtre où l'ASPSP donne accès à
 * l'historique complet (au-delà d'~1 h après l'autorisation, la plupart des
 * banques retombent à 90 jours glissants).
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

    // Stratégie « longest » : EB remonte jusqu'à l'opération la plus ancienne
    // accessible et tire tout l'historique. On ne passe pas de `date_from` pour
    // ne rien plafonner, et cette stratégie n'émet pas d'erreur
    // WRONG_TRANSACTIONS_PERIOD si la banque expose moins de données.
    console.log('[EB] Fetching full history (strategy=longest)');
    const rawTransactions = await fetchAllTransactions(bank.ebAccountUid, { strategy: 'longest' });
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
    // Sync incrémentale : stratégie par défaut, on ne veut que le delta depuis
    // la dernière opération connue.
    rawTransactions = await fetchAllTransactions(bank.ebAccountUid, { dateFrom });
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
  result.consentWarning = consentWarning(bank);

  return result;
}

/**
 * Shared upsert logic: deduplicate, insert new txs, reconcile PENDING→BOOK.
 */
async function upsertTransactions(bankId: string, rawTransactions: any[]): Promise<SyncResult> {
  // Ce que la banque envoie, une fois traduit vers le modèle interne.
  const incoming = rawTransactions
    .map((raw) => normalizeTransaction(raw))
    .filter((tx): tx is NonNullable<typeof tx> => tx !== null);

  const existing = await prisma.transaction.findMany({
    where: { bankId, externalId: { not: null } },
    select: { id: true, externalId: true, status: true, balanceAfterTransaction: true },
  });

  // La décision (créer / réconcilier / ignorer) est prise hors base : c'est la
  // partie qui produit des doublons quand elle se trompe, elle est testée.
  const plan = planReconciliation(incoming, existing);

  let imported = 0;
  if (plan.toCreate.length > 0) {
    const rows = plan.toCreate.map((tx) => ({
      bankId,
      amount: tx.amount,
      description: tx.description,
      date: tx.date,
      externalId: tx.externalId,
      currency: tx.currency,
      balanceAfterTransaction: tx.balanceAfterTransaction,
      status: tx.status,
    }));

    try {
      await prisma.transaction.createMany({ data: rows });
    } catch (err: any) {
      // Contrainte d'unicité : on retombe sur des insertions unitaires pour ne
      // pas perdre tout le lot à cause d'une seule opération déjà présente.
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        for (const row of rows) {
          try {
            await prisma.transaction.create({ data: row });
          } catch { /* doublon ignoré */ }
        }
      } else throw err;
    }
    imported = rows.length;
  }

  for (const update of plan.toUpdate) {
    const data: any = {};
    if (update.status) data.status = update.status;
    if (update.balanceAfterTransaction != null) data.balanceAfterTransaction = update.balanceAfterTransaction;
    await prisma.transaction.update({ where: { id: update.id }, data });
  }

  return {
    imported,
    updated: plan.toUpdate.length,
    skipped: plan.skipped,
    pendingReconciled: plan.pendingReconciled,
    total: rawTransactions.length,
    consentWarning: null,
  };
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

    // Le retour d'autorisation arrive par le tunnel : il doit être ouvert
    // avant de demander l'URL de consentement, pas seulement au démarrage.
    const tunnel = await ensureTunnel();
    if (!tunnel.active && tunnel.error) {
      return res.status(422).json({ error: tunnel.error });
    }

    const state = crypto.randomUUID();
    const baseUrl = getPublicBaseUrl();
    const callbackUrl = `${baseUrl}/api/enablebanking/callback`;

    // Une URL de callback non déclarée chez Enable Banking fait échouer le
    // parcours *après* l'authentification bancaire, sans message exploitable.
    // Autant le dire avant d'envoyer l'utilisateur chez sa banque.
    const registration = await checkRedirectRegistered(callbackUrl);
    if (registration.registered === false) {
      return res.status(422).json({
        error: `L’URL de retour n’est pas déclarée dans votre application Enable Banking. `
          + `Ajoutez-la dans « Redirect URLs » : ${callbackUrl}`,
        callbackUrl,
        registeredUrls: registration.urls,
      });
    }
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
        ebLastSyncAt: null,
      },
    });

    res.json({ link: authData.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enablebanking/select-account — choix explicite après consentement
router.post('/select-account', async (req, res) => {
  const html = (body: string) => callbackHtml(body);
  keepTunnelWarm();
  try {
    const bankId = typeof req.body?.bankId === 'string' ? req.body.bankId : '';
    const state = typeof req.body?.state === 'string' ? req.body.state : '';
    const accountUid = typeof req.body?.accountUid === 'string' ? req.body.accountUid : '';
    if (!bankId || !state || !accountUid) {
      return res.status(400).send(html('<h2>Erreur</h2><p>Choix de compte incomplet.</p>'));
    }

    // `state` est l'anti-CSRF imprévisible fourni lors du démarrage OAuth. Le
    // compte choisi est ensuite revérifié auprès d'Enable Banking avant tout
    // enregistrement local.
    const bank = await prisma.bank.findFirst({
      where: { id: bankId, ebState: state, ebStatus: 'SELECTING_ACCOUNT' },
    });
    if (!bank?.ebSessionId) {
      return res.status(404).send(html('<h2>Erreur</h2><p>Cette sélection a expiré. Relancez la liaison depuis Findy.</p>'));
    }

    const sessionData = await ebFetch(`/sessions/${encodeURIComponent(bank.ebSessionId)}`);
    if (!sessionAccountUids(sessionData).includes(accountUid)) {
      return res.status(400).send(html('<h2>Erreur</h2><p>Ce compte ne fait pas partie de la session autorisée.</p>'));
    }

    const linkedBank = await linkSelectedAccount(bank.id, bank.ebSessionId, accountUid);
    return res.send(linkedAccountHtml(linkedBank.name));
  } catch (err: any) {
    console.error('[EB] Account selection failed:', err);
    return res.status(500).send(html(`<h2>Erreur</h2><p>${escapeHtml(err.message || 'Impossible de sélectionner ce compte.')}</p>`));
  }
});

// GET /api/enablebanking/callback?code=...&state=...
router.get('/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const html = (body: string) => callbackHtml(body);

  if (!code || !state) return res.send(html('<h2>Erreur</h2><p>Paramètres manquants.</p>'));

  // Le parcours n'est pas fini (choix du compte à venir) : on garde le tunnel
  // ouvert encore quelques minutes avant de le refermer.
  keepTunnelWarm();

  try {
    const bank = await prisma.bank.findFirst({ where: { ebState: state } });
    if (!bank) return res.send(html('<h2>Erreur</h2><p>Portefeuille introuvable pour cette connexion.</p>'));

    const sessionData = await ebFetch('/sessions', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    const sessionId = typeof sessionData.session_id === 'string' ? sessionData.session_id : '';
    if (!sessionId) {
      console.error('[EB] Session sans identifiant:', JSON.stringify(sessionData));
      throw new Error("Enable Banking n'a pas renvoyé de session pour cette autorisation.");
    }

    const { data: resolvedSession, uids, attempts } = await resolveSessionAccounts(sessionId, sessionData);
    if (uids.length === 0) {
      // Les logs du sidecar sont muets dans l'app packagée : le diagnostic doit
      // être lisible sur la page de retour et laissé sur disque.
      const debug = {
        aspsp: { name: bank.ebAspspName, country: bank.ebAspspCountry },
        sessionId,
        attempts,
      };
      console.error(`[EB] Session ${sessionId} sans compte exploitable:`, JSON.stringify(debug));
      const debugFile = writeEbDebug('callback:no-accounts', debug);
      // La session reste rattachée au portefeuille : elle est encore
      // consultable pour diagnostic tant que le consentement est valide.
      await prisma.bank.update({ where: { id: bank.id }, data: { ebSessionId: sessionId } });
      const status = sessionStatus(resolvedSession) ?? 'non communiqué';
      return res.send(html(
        '<h2>Erreur</h2>'
        + '<p>La banque a autorisé la connexion mais Enable Banking n’a renvoyé aucun compte.</p>'
        + '<p style="font-size:13px;color:#d4d4d8">Cause la plus fréquente : votre application Enable Banking est en mode '
        + '<em>restreint</em> (activée via « Activate by linking accounts »). Elle ne peut lire que les comptes '
        + 'explicitement liés dans le panneau Enable Banking ; tout autre compte est retiré de la réponse. '
        + 'Liez-y ce compte, ou demandez la levée de la restriction, puis relancez la liaison.</p>'
        + '<p style="font-size:12px"><a style="color:#a78bfa" href="https://enablebanking.com/docs/api/linked-accounts/" target="_blank" rel="noreferrer">Documentation : lier ses propres comptes</a></p>'
        + `<p style="font-size:12px;color:#a1a1aa">${escapeHtml(bank.ebAspspName ?? 'ASPSP inconnu')}`
        + ` · statut de session : ${escapeHtml(status)} · session ${escapeHtml(sessionId.slice(0, 8))}…</p>`
        + '<details style="text-align:left;margin-top:16px"><summary style="cursor:pointer;color:#a78bfa;font-size:13px">Détails techniques</summary>'
        + `<pre style="white-space:pre-wrap;word-break:break-word;font-size:11px;color:#e4e4e7;background:#18181b;border:1px solid #3f3f46;border-radius:12px;padding:12px">${escapeHtml(JSON.stringify(debug, null, 2))}</pre>`
        + (debugFile ? `<p style="font-size:11px;color:#71717a">Copie enregistrée dans ${escapeHtml(debugFile)}</p>` : '')
        + '</details>',
      ));
    }

    const accounts = await describeSessionAccounts(uids);

    if (accounts.length === 1) {
      const linkedBank = await linkSelectedAccount(bank.id, sessionId, accounts[0].uid);
      return res.send(linkedAccountHtml(linkedBank.name));
    }

    await prisma.bank.update({
      where: { id: bank.id },
      data: {
        ebSessionId: sessionId,
        ebAccountUid: null,
        ebStatus: 'SELECTING_ACCOUNT',
        ebLinkedAt: null,
        ebExpiresAt: null,
        ebLastSyncAt: null,
      },
    });

    return res.send(selectAccountHtml(bank.id, state, bank.name, accounts));
  } catch (err: any) {
    res.send(html(`<h2>Erreur</h2><p>${escapeHtml(err.message || 'Impossible de finaliser la liaison bancaire.')}</p>`));
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
        ebAspspCountry: true,
        name: true,
      },
    });
    if (!bank) return res.status(404).json({ error: 'Bank not found' });

    const warning = consentWarning(bank);
    const isExpired = !!bank.ebExpiresAt && bank.ebExpiresAt.getTime() < Date.now();

    // Un consentement échu ne redevient jamais valide : on fige le statut pour
    // que l'interface propose le renouvellement sans attendre une sync ratée.
    if (isExpired && bank.ebStatus === 'LINKED') {
      await prisma.bank.update({ where: { id: req.params.bankId }, data: { ebStatus: 'EXPIRED' } });
    }

    res.json({
      ebStatus: isExpired ? 'EXPIRED' : bank.ebStatus,
      ebLinkedAt: bank.ebLinkedAt,
      ebExpiresAt: bank.ebExpiresAt,
      ebLastSyncAt: bank.ebLastSyncAt,
      ebAspspName: bank.ebAspspName,
      ebAspspCountry: bank.ebAspspCountry,
      consentWarning: warning,
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
