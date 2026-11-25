import assert from 'node:assert/strict';
import test from 'node:test';
import { syncAllBanks, eligibleBanks, type SyncFetch } from './syncAllBanks';
import type { Bank } from '../types';

const mk = (id: string, extra: Partial<Bank> = {}): Bank =>
  ({ id, name: `B${id}`, ebAccountUid: `u${id}`, ebStatus: 'LINKED', archived: false, ...extra }) as Bank;

const resp = (status: number, body: any) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('agrège les banques synchronisées, séquentiellement', async () => {
  const calls: string[] = [];
  const f: SyncFetch = async (url, init) => {
    calls.push(`${init?.method} ${url}`);
    return resp(200, { imported: 2, pendingReconciled: 1 });
  };
  const s = await syncAllBanks([mk('1'), mk('2')], f);
  assert.deepEqual(calls, [
    'POST /api/enablebanking/banks/1/sync-manual',
    'POST /api/enablebanking/banks/2/sync-manual',
  ]);
  assert.equal(s.synced, 2);
  assert.equal(s.imported, 4);
  assert.equal(s.pendingReconciled, 2);
});

test('ignore les banques non éligibles', async () => {
  const now = Date.parse('2026-01-10');
  const banks = [
    mk('ok'),
    mk('manual', { ebAccountUid: null as any }),
    mk('pending', { ebStatus: 'PENDING' }),
    mk('exp', { ebStatus: 'EXPIRED' }),
    mk('arch', { archived: true }),
    mk('past', { ebExpiresAt: '2026-01-01T00:00:00Z' }),
    mk('future', { ebExpiresAt: '2026-02-01T00:00:00Z' }),
  ];
  assert.deepEqual(eligibleBanks(banks, now).map((b) => b.id), ['ok', 'future']);
});

test('aucune banque éligible : aucun appel', async () => {
  let n = 0;
  const s = await syncAllBanks([mk('1', { ebStatus: 'PENDING' })], async () => { n++; return resp(200, {}); });
  assert.equal(n, 0);
  assert.equal(s.attempted, 0);
});

test('poursuit après une erreur, un cooldown et un consentement expiré', async () => {
  const answers: Record<string, any> = {
    '1': () => resp(500, { error: 'boom' }),
    '2': () => resp(429, { message: 'wait' }),
    '3': () => resp(403, { error: 'CONSENT_EXPIRED' }),
    '4': () => { throw new Error('réseau'); },
    '5': () => resp(200, { imported: 3, pendingReconciled: 0 }),
  };
  const f: SyncFetch = async (url) => answers[url.split('/')[4]]();
  const s = await syncAllBanks(['1', '2', '3', '4', '5'].map((i) => mk(i)), f);
  assert.equal(s.synced, 1);
  assert.equal(s.imported, 3);
  assert.equal(s.skippedCooldown, 1);
  assert.equal(s.expired, 1);
  assert.deepEqual(s.failed, [
    { name: 'B1', message: 'boom' },
    { name: 'B4', message: 'réseau' },
  ]);
});

test('mode démo (403 DEMO_UNAVAILABLE) : compté en échec sans exception', async () => {
  const s = await syncAllBanks([mk('1')], async () => resp(403, { error: 'DEMO_UNAVAILABLE' }));
  assert.equal(s.failed.length, 1);
  assert.equal(s.synced, 0);
});
