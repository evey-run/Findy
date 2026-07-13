import express from 'express';
import crypto from 'node:crypto';
import prisma from '../prisma';

const router = express.Router();
const EB_BASE = 'https://api.enablebanking.com';

let jwtCache: { token: string; expiresAt: number } | null = null;

function buildJWT(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const privateKeyStr = process.env.ENABLE_BANKING_RSA_KEY;
  if (!appId || !privateKeyStr) throw new Error('Enable Banking credentials not configured (ENABLE_BANKING_APP_ID / ENABLE_BANKING_RSA_KEY)');

  // The key might be in different formats, let's check and format appropriately
  let privateKey = privateKeyStr.trim();
  if (!privateKey.includes('-----BEGIN')) {
    // It's base64 encoded, wrap it in PEM headers
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
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

// GET /api/enablebanking/configured
router.get('/configured', (_req, res) => {
  const configured = !!(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_RSA_KEY);
  res.json({ configured });
});

// GET /api/enablebanking/aspsps?country=fr
router.get('/aspsps', async (req, res) => {
  try {
    const country = ((req.query.country as string) || 'fr').toLowerCase();
    const data = await ebFetch(`/aspsps?country=${country}`);
    // Enable Banking returns { aspsps: [...] } or an array directly
    const aspsps = data.aspsps ?? data;
    // Ensure we always return an array with name, country, logo fields
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
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT || 36321}`;
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

    // Use Vercel edge function for redirect handling if running on Vercel
    // Falls back to direct link if not deployed to Vercel
    const redirectLink = `${baseUrl}/api/enablebanking-redirect?${new URLSearchParams({
      bankId,
      aspspName: aspspName.toUpperCase(),
      aspspCountry: aspspCountry.toUpperCase(),
      redirectUrl: authData.url,
    }).toString()}`;

    res.json({
      link: authData.url,
      redirectLink, // Edge function redirect URL for analytics
    });
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
    // accounts may be [{uid: string}] or [string]
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

    res.send(html(`
      <div style="max-width:420px;margin:0 auto">
        <div style="font-size:56px;margin-bottom:16px">✅</div>
        <h2>Compte lié avec succès !</h2>
        <p style="color:#a0aec0"><strong style="color:#fff">${bank.name}</strong> est maintenant connecté à Enable Banking.</p>
        <p style="color:#a0aec0">Vous pouvez fermer cette fenêtre et revenir dans l'application pour synchroniser vos transactions.</p>
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
      select: { ebStatus: true, ebLinkedAt: true, ebExpiresAt: true },
    });
    if (!bank) return res.status(404).json({ error: 'Bank not found' });
    res.json(bank);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enablebanking/banks/:bankId/sync
router.post('/banks/:bankId/sync', async (req, res) => {
  try {
    const bank = await prisma.bank.findUnique({ where: { id: req.params.bankId } });
    if (!bank) return res.status(404).json({ error: 'Bank not found' });
    if (!bank.ebAccountUid) return res.status(400).json({ error: 'Bank not linked to Enable Banking' });

    let allTransactions: any[] = [];
    let continuationKey: string | null = null;

    do {
      const url = continuationKey
        ? `/accounts/${bank.ebAccountUid}/transactions?continuation_key=${encodeURIComponent(continuationKey)}`
        : `/accounts/${bank.ebAccountUid}/transactions`;
      const data = await ebFetch(url);
      allTransactions = allTransactions.concat(data.transactions || []);
      continuationKey = data.continuation_key ?? null;
    } while (continuationKey);

    let imported = 0;
    let skipped = 0;

    for (const t of allTransactions) {
      const externalId = t.entry_reference ?? t.transaction_id;
      if (!externalId) continue;

      const exists = await prisma.transaction.findFirst({ where: { externalId, bankId: bank.id } });
      if (exists) { skipped++; continue; }

      const rawAmount = parseFloat(t.transaction_amount?.amount ?? t.amount ?? '0');
      // Enable Banking amounts are always positive; sign is set by credit_debit_indicator
      const amount = t.credit_debit_indicator === 'CRDT' ? rawAmount : -rawAmount;

      const date = new Date(t.booking_date ?? t.transaction_date ?? t.value_date ?? new Date());
      const description =
        (Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : t.remittance_information) ??
        t.creditor?.name ??
        t.debtor?.name ??
        'Transaction';

      await prisma.transaction.create({
        data: { bankId: bank.id, amount, description, date, externalId },
      });
      imported++;
    }

    res.json({ imported, skipped, total: allTransactions.length });
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
      },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
