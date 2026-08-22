import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../prisma';
import { resolveScope, resolveSpaceForUsers } from '../lib/scope';
import { computeBalance } from '../lib/balance';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Normalise les quatre derniers chiffres d'une carte.
 *
 * On ne conserve jamais le numéro complet : il n'est utilisé nulle part, et la
 * base part telle quelle dans les sauvegardes JSON. Si l'utilisateur colle un
 * numéro entier, on n'en garde que la fin.
 */
function normalizeCardLast4(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined as unknown as null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits.slice(-4);
}

/**
 * Un compte appartient désormais à un Espace. L'UI, elle, raisonne encore en
 * « qui possède ce compte ? » — on expose donc `users` (les membres de l'espace)
 * et `userBanks` (même forme qu'avant) pour ne rien casser côté front.
 */
function withSpaceMembers(bank: any) {
  const users = (bank.space?.members ?? []).map((m: any) => m.user);
  return {
    ...bank,
    initialBalance: bank.balance,
    users,
    userBanks: users.map((user: any) => ({ userId: user.id, bankId: bank.id, user })),
    spaceName: bank.space?.name ?? null
  };
}
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Configuration multer pour l'upload d'images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, 'public/uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bank-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers images sont autorisés'));
    }
  }
});

// GET /api/banks - Get all banks (optionally filtered by user)
router.get('/', async (req, res) => {
  try {
    const { archived } = req.query;

    // Construire le filtre where
    let whereClause: any = {};

    // Portée : un espace précis (spaceId) ou l'union des espaces de l'utilisateur (userId)
    const scope = await resolveScope(req.query as any, req.authUserId);
    if (scope) {
      whereClause.spaceId = { in: scope };
    }
    
    // Filtre par statut archivé
    if (archived !== undefined) {
      whereClause.archived = archived === 'true';
    }
    
    const banks = await prisma.bank.findMany({
      where: whereClause,
      include: {
        space: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatar: true } } } }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Solde = bank.balance + mouvements, avec deux régimes selon le type de
    // compte (cf. lib/balance.ts). On agrège séparément les transactions qui
    // portent une quantité (achat/vente d'actif) des autres (flux de trésorerie).
    const bankIds = banks.map(b => b.id);
    const [assetSums, cashSums] = bankIds.length > 0
      ? await Promise.all([
          prisma.transaction.groupBy({
            by: ['bankId'],
            where: { bankId: { in: bankIds }, quantity: { not: null } },
            _sum: { amount: true },
          }),
          prisma.transaction.groupBy({
            by: ['bankId'],
            where: { bankId: { in: bankIds }, quantity: null },
            _sum: { amount: true },
          }),
        ])
      : [[], []];
    const assetFlow = new Map(assetSums.map((g) => [g.bankId, g._sum.amount ?? 0]));
    const cashFlow = new Map(cashSums.map((g) => [g.bankId, g._sum.amount ?? 0]));

    // Transform the data to match the expected format
    const transformedBanks = banks.map(bank => ({
      ...withSpaceMembers(bank),
      // `initialBalance` = valeur stockée, celle qu'édite le formulaire.
      // `balance` = solde affiché, recalculé depuis les mouvements.
      initialBalance: bank.balance,
      balance: computeBalance(bank, {
        assetFlow: assetFlow.get(bank.id) ?? 0,
        cashFlow: cashFlow.get(bank.id) ?? 0
      })
    }));
    
    res.json(transformedBanks);
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// GET /api/banks/:id - Get a specific bank
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bank = await prisma.bank.findUnique({
      where: { id },
      include: {
        space: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatar: true } } } }
          }
        }
      }
    });

    if (!bank) {
      return res.status(404).json({ error: 'Bank not found' });
    }

    res.json(withSpaceMembers(bank));
  } catch (error) {
    console.error('Error fetching bank:', error);
    res.status(500).json({ error: 'Failed to fetch bank' });
  }
});

// POST /api/banks - Create a new bank
router.post('/', upload.single('image'), async (req, res) => {
  try {
    let { name, shortName, color, iban, balance, createdAt, accountType, data, cardLast4 } = req.body;
    let userIds: string[] = [];

    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      name = parsed.name || name;
      shortName = parsed.shortName || shortName;
      color = parsed.color || color;
      iban = parsed.iban || iban;
      balance = parsed.balance !== undefined ? parsed.balance : balance;
      accountType = parsed.accountType || accountType;
      createdAt = parsed.createdAt || createdAt;
      userIds = Array.isArray(parsed.userIds) ? parsed.userIds : [];
    } else {
      for (const key in req.body) {
        if (key.startsWith('userIds[')) userIds.push(req.body[key]);
      }
    }

    console.log('🔧 Creating bank with data:', { name, shortName, color, iban, balance, userIds, createdAt });

    if (!name || userIds.length === 0) {
      return res.status(400).json({ error: 'Name and at least one user are required' });
    }
    
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    // Si createdAt est fourni, l'utiliser, sinon utiliser la date actuelle
    const createdAtDate = createdAt ? new Date(createdAt) : new Date();
    
    const bank = await prisma.bank.create({
      data: {
        name,
        shortName,
        color: color || '#3b82f6',
        image: imageUrl,
        iban,
        cardLast4: normalizeCardLast4(cardLast4) ?? null,
        balance: parseFloat(balance) || 0,
        accountType: accountType || 'CURRENT',
        createdAt: createdAtDate,
        // L'UI coche des personnes ; on en déduit l'espace correspondant
        // (réutilisé s'il existe déjà avec exactement ces membres, sinon créé).
        spaceId: await resolveSpaceForUsers(userIds)
      },
      include: {
        space: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatar: true } } } }
          }
        }
      }
    });

    const transformedBank = withSpaceMembers(bank);

    console.log('🔧 Bank created successfully:', transformedBank.name);
    res.status(201).json(transformedBank);
  } catch (error) {
    console.error('🔧 Error creating bank:', error);
    res.status(500).json({ error: 'Failed to create bank', details: error.message });
  }
});

// PUT /api/banks/:id - Update a bank
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔧 Raw request body:', req.body);
    let { name, shortName, color, iban, balance, createdAt, accountType, data, cardLast4 } = req.body;
    console.log('🔧 Initial values - accountType:', accountType, 'data:', data);
    
    // Vérifier si les données sont envoyées dans le champ 'data' (format JSON)
    let userIds: string[] = [];
    
    // Extraire les données du formulaire
    if (data) {
      try {
        // Si data est une chaîne, la parser en JSON
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        console.log('🔍 Parsed data from form:', parsedData);
        
        // Extraire les IDs utilisateurs
        userIds = Array.isArray(parsedData.userIds) ? parsedData.userIds : [];
        
        // Mettre à jour tous les champs du formulaire
        name = parsedData.name || name;
        shortName = parsedData.shortName || shortName;
        color = parsedData.color || color;
        iban = parsedData.iban || iban;
        balance = parsedData.balance !== undefined ? parseFloat(parsedData.balance) : balance;
        accountType = parsedData.accountType !== undefined ? parsedData.accountType : (accountType || 'CURRENT');
        createdAt = parsedData.createdAt || createdAt;
        
        console.log('🔍 Extracted values:', { name, shortName, color, iban, balance, accountType, userIds });
      } catch (error) {
        console.error('❌ Error parsing data field:', error);
      }
    } else {
      console.log('ℹ️ No data field found in request, using direct form fields');
      // Récupérer les userIds de l'ancienne méthode (pour rétrocompatibilité)
      for (const key in req.body) {
        if (key.startsWith('userIds[')) {
          userIds.push(req.body[key]);
        }
      }
    }
    
    const updateData: any = {
      name,
      shortName,
      color,
      iban,
      balance: parseFloat(balance),
      accountType: accountType // Utiliser directement accountType sans fallback ici
    };
    
    console.log('📝 Final update data before DB update:');
    console.log(JSON.stringify(updateData, null, 2));
    console.log('🔍 Account type being saved:', updateData.accountType);
    
    // Si createdAt est fourni, l'utiliser
    if (createdAt) {
      updateData.createdAt = new Date(createdAt);
    }
    
    // Add image if uploaded
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }
    
    // Le numéro de carte n'est touché que s'il est explicitement fourni.
    if ('cardLast4' in req.body) {
      updateData.cardLast4 = normalizeCardLast4(req.body.cardLast4);
    }

    // Changer les propriétaires = déplacer le compte vers l'espace correspondant.
    if (userIds.length > 0) {
      updateData.spaceId = await resolveSpaceForUsers(userIds);
    }
    // Déplacement explicite vers un espace donné (action « Déplacer vers… »).
    if (req.body.spaceId) {
      updateData.spaceId = req.body.spaceId;
    }

    console.log('🔧 About to update bank with ID:', id);
    const bank = await prisma.bank.update({
      where: { id },
      data: updateData,
      include: {
        space: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatar: true } } } }
          }
        }
      }
    });

    res.json(withSpaceMembers(bank));
  } catch (error) {
    console.error('Error updating bank:', error);
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// PUT /api/banks/:id/restore - Restore an archived bank
router.put('/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    
    const bank = await prisma.bank.update({
      where: { id },
      data: { archived: false },
      include: {
        space: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatar: true } } } }
          }
        }
      }
    });

    res.json(withSpaceMembers(bank));
  } catch (error) {
    console.error('Error restoring bank:', error);
    res.status(500).json({ error: 'Failed to restore bank' });
  }
});

// DELETE /api/banks/:id/permanent - Permanently delete an archived bank and all associated data
router.delete('/:id/permanent', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the bank name for the response
    const bank = await prisma.bank.findUnique({
      where: { id },
      select: { name: true }
    });
    
    if (!bank) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    // Count transactions before deletion for the response
    const transactionCount = await prisma.transaction.count({
      where: { bankId: id }
    });
    
    // Use a transaction to ensure all deletions succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Delete all transactions associated with this bank
      await tx.transaction.deleteMany({
        where: { bankId: id }
      });
      
      // Delete all budgets associated with categories that might reference this bank
      await tx.budget.deleteMany({
        where: { bankId: id }
      });
      
      // Delete all recurrences associated with this bank
      await tx.recurrence.deleteMany({
        where: { bankId: id }
      });
      
      // Finally, delete the bank itself
      await tx.bank.delete({
        where: { id }
      });
    });
    
    res.json({
      message: 'Bank permanently deleted',
      bankName: bank.name,
      deletedTransactions: transactionCount
    });
  } catch (error) {
    console.error('Error permanently deleting bank:', error);
    res.status(500).json({ error: 'Failed to permanently delete bank' });
  }
});

// DELETE /api/banks/:id - Delete a bank (archive it)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Archive the bank instead of deleting it
    await prisma.bank.update({
      where: { id },
      data: { archived: true }
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error archiving bank:', error);
    res.status(500).json({ error: 'Failed to archive bank' });
  }
});

// PATCH /api/banks/:id/spendable — compter ou non ce compte dans le reste à vivre.
//
// Point d'entrée dédié : `PUT /api/banks/:id` réécrit le compte entier (nom,
// solde, type…), l'utiliser pour un seul drapeau enverrait `balance: NaN`.
router.patch('/:id/spendable', async (req, res) => {
  try {
    // Le compte doit appartenir à un espace du profil connecté : sans cette
    // vérification, n'importe qui pourrait modifier le compte d'un autre.
    const scope = await resolveScope(req.query as any, req.authUserId);
    const bank = await prisma.bank.findFirst({
      where: { id: req.params.id, spaceId: { in: scope } },
      select: { id: true },
    });
    if (!bank) return res.status(404).json({ error: 'Compte introuvable' });

    const raw = req.body?.spendable;
    // `null` remet la déduction automatique par type de compte.
    const spendable = raw === null || raw === undefined ? null : Boolean(raw);

    const updated = await prisma.bank.update({
      where: { id: bank.id },
      data: { spendable },
      select: { id: true, name: true, spendable: true },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error updating spendable flag:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

export default router;
