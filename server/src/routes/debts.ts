import express from 'express';
import prisma from '../prisma';
import { netBalance } from '../lib/debtBalance';

const router = express.Router();

// Le « Moi » d'un tricount est le profil connecté. Le flag `isMe` en base ne
// sert plus que de repli pour d'anciennes sessions sans jeton.
async function getMe(authUserId?: string) {
  if (authUserId) return prisma.user.findUnique({ where: { id: authUserId } });
  return prisma.user.findFirst({ where: { isMe: true } });
}

// Renvoie les IDs des banques (portefeuilles) accessibles à un utilisateur,
// c'est-à-dire celles des espaces dont il est membre.
async function bankIdsForUser(userId: string): Promise<string[]> {
  const banks = await prisma.bank.findMany({
    where: { space: { members: { some: { userId } } } },
    select: { id: true }
  });
  return banks.map((b) => b.id);
}

// GET /api/debts?userId=X
// Renvoie les dettes entre « Moi » et X, ainsi que le solde net.
// balance > 0  => X me doit de l'argent
// balance < 0  => je dois de l'argent à X
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query as { userId?: string };
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const me = await getMe(req.authUserId);
    if (!me) {
      return res.status(400).json({ error: 'NO_ME_USER', message: 'Aucun utilisateur « Moi » défini.' });
    }
    if (me.id === userId) {
      return res.status(400).json({ error: 'SAME_USER', message: 'Impossible de créer un tricount avec soi-même.' });
    }

    const other = await prisma.user.findUnique({ where: { id: userId } });
    if (!other) {
      return res.status(404).json({ error: 'User not found' });
    }

    const debts = await prisma.debt.findMany({
      where: {
        OR: [
          { fromUserId: me.id, toUserId: other.id },
          { fromUserId: other.id, toUserId: me.id }
        ]
      },
      orderBy: { date: 'desc' }
    });

    res.json({ me, other, debts, balance: netBalance(debts, me.id, other.id) });
  } catch (error) {
    console.error('Error fetching debts:', error);
    res.status(500).json({ error: 'Failed to fetch debts' });
  }
});

// GET /api/debts/transfers?userId=X
// Détecte les virements entre les comptes de « Moi » et ceux de X
// (transactions de montant opposé et de dates proches).
router.get('/transfers', async (req, res) => {
  try {
    const { userId } = req.query as { userId?: string };
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const me = await getMe(req.authUserId);
    if (!me) {
      return res.status(400).json({ error: 'NO_ME_USER', message: 'Aucun utilisateur « Moi » défini.' });
    }

    const [myBankIds, otherBankIds] = await Promise.all([
      bankIdsForUser(me.id),
      bankIdsForUser(userId)
    ]);

    if (myBankIds.length === 0 || otherBankIds.length === 0) {
      return res.json({ transfers: [] });
    }

    const [myTx, otherTx] = await Promise.all([
      prisma.transaction.findMany({
        where: { bankId: { in: myBankIds } },
        orderBy: { date: 'desc' },
        take: 1000,
        select: { id: true, amount: true, description: true, date: true, bankId: true }
      }),
      prisma.transaction.findMany({
        where: { bankId: { in: otherBankIds } },
        orderBy: { date: 'desc' },
        take: 1000,
        select: { id: true, amount: true, description: true, date: true, bankId: true }
      })
    ]);

    // Indexe les transactions de X par montant absolu arrondi au centime.
    const key = (amt: number) => Math.round(Math.abs(amt) * 100);
    const otherByAmount = new Map<number, typeof otherTx>();
    for (const t of otherTx) {
      const k = key(t.amount);
      if (!otherByAmount.has(k)) otherByAmount.set(k, []);
      otherByAmount.get(k)!.push(t);
    }

    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
    // Un vrai virement de compte à compte porte presque toujours un libellé de
    // virement. On l'exige pour éviter les faux positifs (montants opposés
    // identiques par pur hasard).
    const looksLikeTransfer = (desc: string) =>
      /vir(?:ement)?|transfer|transfert|\bvers\b/i.test(desc || '');
    // Un même identifiant de transaction ne peut appartenir qu'à un seul virement
    // apparié — évite les doublons quand un compte est copartagé (il figure alors
    // dans les deux ensembles et le virement serait détecté dans les deux sens).
    const used = new Set<string>();
    const transfers: any[] = [];

    for (const mt of myTx) {
      if (mt.amount === 0 || used.has(mt.id)) continue;
      const candidates = otherByAmount.get(key(mt.amount)) || [];
      // Cherche une transaction opposée (débit d'un côté = crédit de l'autre).
      const match = candidates.find(
        (ot) =>
          ot.id !== mt.id &&
          !used.has(ot.id) &&
          Math.sign(ot.amount) === -Math.sign(mt.amount) &&
          Math.abs(new Date(ot.date).getTime() - new Date(mt.date).getTime()) <= FIVE_DAYS &&
          (looksLikeTransfer(mt.description) || looksLikeTransfer(ot.description))
      );
      if (!match) continue;
      used.add(mt.id);
      used.add(match.id);

      transfers.push({
        id: `${mt.id}_${match.id}`,
        date: mt.amount < 0 ? mt.date : match.date,
        amount: Math.abs(mt.amount),
        // Sens du virement du point de vue de « Moi ».
        direction: mt.amount < 0 ? 'me_to_other' : 'other_to_me',
        myDescription: mt.description,
        otherDescription: match.description
      });
    }

    transfers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ transfers });
  } catch (error) {
    console.error('Error detecting transfers:', error);
    res.status(500).json({ error: 'Failed to detect transfers' });
  }
});

// POST /api/debts - Créer une dette entre deux personnes
router.post('/', async (req, res) => {
  try {
    const { fromUserId, toUserId, amount, description, date } = req.body;

    if (!fromUserId || !toUserId) {
      return res.status(400).json({ error: 'fromUserId and toUserId are required' });
    }
    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'fromUserId and toUserId must differ' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'A positive amount is required' });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: 'A description is required' });
    }

    // Vérifie que les deux utilisateurs existent.
    const count = await prisma.user.count({ where: { id: { in: [fromUserId, toUserId] } } });
    if (count !== 2) {
      return res.status(404).json({ error: 'User not found' });
    }

    const debt = await prisma.debt.create({
      data: {
        fromUserId,
        toUserId,
        amount: parsedAmount,
        description: String(description).trim(),
        date: date ? new Date(date) : new Date()
      }
    });

    res.status(201).json(debt);
  } catch (error) {
    console.error('Error creating debt:', error);
    res.status(500).json({ error: 'Failed to create debt' });
  }
});

// PUT /api/debts/:id - Mettre à jour une dette (montant, description, date, réglée)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, date, settled } = req.body;

    const data: any = {};
    if (amount !== undefined) {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'A positive amount is required' });
      }
      data.amount = parsed;
    }
    if (description !== undefined) {
      if (!String(description).trim()) {
        return res.status(400).json({ error: 'A description is required' });
      }
      data.description = String(description).trim();
    }
    if (date !== undefined) data.date = new Date(date);
    if (settled !== undefined) data.settled = !!settled;

    const debt = await prisma.debt.update({ where: { id }, data });
    res.json(debt);
  } catch (error: any) {
    console.error('Error updating debt:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Debt not found' });
    }
    res.status(500).json({ error: 'Failed to update debt' });
  }
});

// DELETE /api/debts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.debt.delete({ where: { id } });
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting debt:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Debt not found' });
    }
    res.status(500).json({ error: 'Failed to delete debt' });
  }
});

export default router;
