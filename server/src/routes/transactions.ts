import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/transactions - Récupérer toutes les transactions
router.get('/', async (req, res) => {
  try {
    const { bankId, categoryId, shared, startDate, endDate, limit, offset, search } = req.query;
    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (categoryId) where.categoryId = categoryId;
    if (shared !== undefined) where.shared = shared === 'true';
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }
    // Ajout du filtre de recherche par mot-clé
    if (search && typeof search === 'string' && search.trim() !== '') {
      // Nettoyage des espaces et normalisation (suppression des accents)
      const normalizedSearch = search.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Supprime les accents
      
      // Utiliser une expression régulière pour la recherche insensible à la casse
      // Prisma ne supporte pas directement la recherche insensible aux accents
      // Nous utilisons donc une approche alternative avec plusieurs conditions OR
      
      // Créer une version avec accents possibles pour la recherche
      const searchWithAccents = search.trim();
      
      // Recherche avec plusieurs conditions OR pour maximiser les correspondances
      where.OR = [
        {
          // Recherche standard
          description: {
            contains: searchWithAccents
          }
        },
        {
          // Recherche avec la version normalisée (sans accents)
          description: {
            contains: normalizedSearch
          }
        }
      ];
      
      console.log('🔍 Recherche description (normalisée sans accents):', normalizedSearch);
      console.log('🔍 Recherche description (avec accents possibles):', searchWithAccents);
    }
    console.log('🔍 Filtre where:', JSON.stringify(where));
    
    // Forcer le rechargement - incluant image pour les banques
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true,
            balance: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      },
      take: limit ? parseInt(limit as string) : undefined,
      skip: offset ? parseInt(offset as string) : undefined
    });
    
    // Debug: log the first transaction bank to see what fields are returned
    if (transactions.length > 0) {
      console.log('🔍 DEBUG - Premier bank d\'une transaction:', JSON.stringify(transactions[0].bank, null, 2));
    }
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/stats/summary - Statistiques résumées
router.get('/stats/summary', async (req, res) => {
  try {
    const { bankId, startDate, endDate } = req.query;
    
    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }
    
    const [incomeSum, expenseSum, transactionCount] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...where, amount: { gt: 0 } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { ...where, amount: { lt: 0 } },
        _sum: { amount: true }
      }),
      prisma.transaction.count({ where })
    ]);
    
    const totalIncome = incomeSum._sum.amount || 0;
    const totalExpenses = Math.abs(expenseSum._sum.amount || 0);
    const balance = totalIncome - totalExpenses;
    
    res.json({
      totalIncome,
      totalExpenses,
      balance,
      transactionCount
    });
  } catch (error) {
    console.error('Error fetching transaction summary:', error);
    res.status(500).json({ error: 'Failed to fetch transaction summary' });
  }
});

// GET /api/transactions/:id - Récupérer une transaction par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// POST /api/transactions - Créer une nouvelle transaction
router.post('/', async (req, res) => {
  try {
    const { amount, description, date, shared, bankId, categoryId, unitPrice, quantity } = req.body;
    
    // Logs de debug pour voir les valeurs reçues
    console.log('🔍 DEBUG - POST /api/transactions - Données reçues:');
    console.log('amount:', amount, typeof amount);
    console.log('description:', description);
    console.log('date:', date);
    console.log('bankId:', bankId);
    console.log('unitPrice:', unitPrice, typeof unitPrice);
    console.log('quantity:', quantity, typeof quantity);
    
    if (!amount || !description || !bankId) {
      return res.status(400).json({ 
        error: 'Amount, description, and bankId are required' 
      });
    }
    
    // Vérifier que la banque existe
    const bank = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!bank) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    // Vérifier que la catégorie existe si elle est fournie
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }
    
    // Auto-assign category based on keywords if not provided
    let assignedCategoryId: string | null = categoryId || null;
    if (!assignedCategoryId && description) {
      try {
        const allKeywords = await prisma.categoryKeyword.findMany({
          select: { value: true, categoryId: true }
        });
        const rulesByCategory: Record<string, string[]> = {};
        for (const k of allKeywords) {
          const v = (k.value || '').toLowerCase().trim();
          if (!v) continue;
          if (!rulesByCategory[k.categoryId]) rulesByCategory[k.categoryId] = [];
          rulesByCategory[k.categoryId].push(v);
        }
        const desc = (description || '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        outer: for (const [cid, kws] of Object.entries(rulesByCategory)) {
          for (const kw of kws) {
            const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (desc.includes(kwNorm)) { assignedCategoryId = cid; break outer; }
          }
        }
      } catch (e) {
        console.error('Auto-assign on create failed:', e);
      }
    }

    // Préparer les données à envoyer à Prisma
    const transactionData = {
      amount: parseFloat(amount),
      description,
      date: date ? new Date(date) : new Date(),
      shared: shared || false,
      bankId,
      categoryId: assignedCategoryId,
      unitPrice: unitPrice ? parseFloat(unitPrice) : null,
      quantity: quantity ? parseFloat(quantity) : null
    };
    
    // Log des données qui seront envoyées à Prisma
    console.log('🔍 DEBUG - Données envoyées à Prisma:', JSON.stringify(transactionData, null, 2));
    
    const transaction = await prisma.transaction.create({
      data: transactionData,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    // Log de la transaction créée
    console.log('🔍 DEBUG - Transaction créée:', JSON.stringify(transaction, null, 2));
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id - Mettre à jour une transaction
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, date, shared, categoryId, bankId, unitPrice, quantity } = req.body;
    
    // Vérifier que la banque existe si elle est fournie
    if (bankId) {
      const bank = await prisma.bank.findUnique({ where: { id: bankId } });
      if (!bank) {
        return res.status(404).json({ error: 'Bank not found' });
      }
    }
    
    // Vérifier que la catégorie existe si elle est fournie
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }
    
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(description && { description }),
        ...(date && { date: new Date(date) }),
        ...(shared !== undefined && { shared }),
        ...(categoryId !== undefined && { categoryId }),
        ...(bankId !== undefined && { bankId }),
        ...(unitPrice !== undefined && { unitPrice: unitPrice ? parseFloat(unitPrice) : null }),
        ...(quantity !== undefined && { quantity: quantity ? parseFloat(quantity) : null })
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    res.json(transaction);
  } catch (error: any) {
    console.error('Error updating transaction:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id - Supprimer une transaction
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.transaction.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// POST /api/transactions/bulk-update - Mettre à jour en lot selon des filtres
router.post('/bulk-update', async (req, res) => {
  try {
    const { filters, actions } = req.body as {
      filters: {
        searchText?: string;
        categoryId?: string;
        bankId?: string;
        checked?: string; // 'true' | 'false' | ''
        startDate?: string;
        endDate?: string;
      };
      actions: {
        replaceText?: { enabled: boolean; from?: string; to?: string; replaceAll?: boolean };
        changeCategory?: { enabled: boolean; categoryId?: string };
        changeChecked?: { enabled: boolean; checked?: boolean };
        changeBank?: { enabled: boolean; bankId?: string };
      };
    };

    if (!filters || !actions) {
      return res.status(400).json({ error: 'Missing filters or actions' });
    }

    // Construire la clause where depuis les filtres
    const where: any = {};
    const { searchText, categoryId, bankId, checked, startDate, endDate } = filters;
    if (bankId) where.bankId = bankId;
    if (categoryId) {
      if (categoryId === 'undefined') {
        where.categoryId = null;
      } else {
        where.categoryId = categoryId;
      }
    }
    if (checked !== undefined && checked !== '') {
      where.checked = checked === 'true';
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (!isNaN(sd.getTime())) {
          where.date.gte = sd;
        }
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (!isNaN(ed.getTime())) {
          where.date.lte = ed;
        }
      }
      // If neither date parsed validly, drop the date filter
      if (Object.keys(where.date).length === 0) {
        delete where.date;
      }
    }
    if (searchText && searchText.trim() !== '') {
      where.description = { contains: searchText.trim() };
    }

    // Construire les données de mise à jour communes (hors remplacement partiel de description)
    const data: any = {};
    if (actions.changeCategory?.enabled) {
      const catId = actions.changeCategory.categoryId;
      if (catId === 'undefined' || catId === '' || catId === undefined) {
        data.categoryId = null;
      } else {
        // Validate category exists
        const cat = await prisma.category.findUnique({ where: { id: catId } });
        if (!cat) {
          return res.status(400).json({ error: 'Invalid categoryId for changeCategory' });
        }
        data.categoryId = catId;
      }
    }
    if (actions.changeChecked?.enabled && typeof actions.changeChecked.checked === 'boolean') {
      data.checked = actions.changeChecked.checked;
    }
    if (actions.changeBank?.enabled && actions.changeBank.bankId) {
      const bId = actions.changeBank.bankId;
      // Validate bank exists
      const bank = await prisma.bank.findUnique({ where: { id: bId } });
      if (!bank) {
        return res.status(400).json({ error: 'Invalid bankId for changeBank' });
      }
      data.bankId = bId;
    }

    const doReplace = actions.replaceText?.enabled;
    const replaceAll = !!actions.replaceText?.replaceAll;
    const replaceFrom = actions.replaceText?.from || '';
    const replaceTo = actions.replaceText?.to || '';

    // Compter les correspondances
    const matchedCount = await prisma.transaction.count({ where });

    let updatedCount = 0;

    if (matchedCount === 0) {
      return res.json({ matchedCount: 0, updatedCount: 0 });
    }

    if (doReplace) {
      if (replaceAll) {
        // Remplacer toute la description par "to" pour toutes les correspondances
        const result = await prisma.transaction.updateMany({
          where,
          data: {
            ...data,
            ...(replaceTo !== undefined ? { description: replaceTo } : {})
          }
        });
        updatedCount = result.count;
      } else {
        // Remplacement partiel: nécessite une mise à jour individuelle
        const items = await prisma.transaction.findMany({
          where,
          select: { id: true, description: true }
        });
        for (const it of items) {
          const current = it.description || '';
          if (!replaceFrom) continue;
          const newDesc = current.replace(new RegExp(replaceFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceTo);
          // Appliquer uniquement si un changement
          const dataPerItem: any = { ...data };
          if (newDesc !== current) {
            dataPerItem.description = newDesc;
          }
          if (Object.keys(dataPerItem).length === 0) {
            continue;
          }
          await prisma.transaction.update({ where: { id: it.id }, data: dataPerItem });
          updatedCount += 1;
        }
      }
    } else {
      // Pas de remplacement description: updateMany simple
      if (Object.keys(data).length === 0) {
        return res.json({ matchedCount, updatedCount: 0 });
      }
      const result = await prisma.transaction.updateMany({ where, data });
      updatedCount = result.count;
    }

    return res.json({ matchedCount, updatedCount });
  } catch (error) {
    console.error('Error in bulk-update:', error);
    return res.status(500).json({ error: 'Failed to perform bulk update' });
  }
});

// POST /api/transactions/search - Rechercher des transactions selon des filtres (utilisé par le formulaire de modification en lot)
router.post('/search', async (req, res) => {
  try {
    const { searchText, categoryId, bankId, checked, startDate, endDate } = req.body as {
      searchText?: string;
      categoryId?: string;
      bankId?: string;
      checked?: string; // 'true' | 'false' | ''
      startDate?: string;
      endDate?: string;
    };

    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (categoryId) {
      if (categoryId === 'undefined') {
        where.categoryId = null;
      } else {
        where.categoryId = categoryId;
      }
    }
    if (checked !== undefined && checked !== '') {
      where.checked = checked === 'true';
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (!isNaN(sd.getTime())) where.date.gte = sd;
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (!isNaN(ed.getTime())) where.date.lte = ed;
      }
      if (Object.keys(where.date).length === 0) delete where.date;
    }
    if (searchText && searchText.trim() !== '') {
      where.description = { contains: searchText.trim() };
    }

    const [transactions, count] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          bank: {
            select: { id: true, name: true, shortName: true, color: true, image: true, balance: true }
          },
          category: {
            select: { id: true, name: true, type: true, color: true, icon: true }
          }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.transaction.count({ where })
    ]);

    return res.json({ count, transactions });
  } catch (error: any) {
    console.error('Error in /transactions/search:', error);
    return res.status(500).json({ error: 'Failed to search transactions', details: error?.message || String(error) });
  }
});

export default router;
