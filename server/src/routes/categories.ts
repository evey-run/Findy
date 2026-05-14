import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validate } from '../middlewares/validate';
import { IdParam } from '../schemas/common';
import {
  ListCategoriesQuery,
  CreateCategoryBody,
  UpdateCategoryBody,
} from '../schemas/categories';
import type { z } from 'zod';

const router = express.Router();

// GET /api/categories - Récupérer toutes les catégories
router.get('/', validate({ query: ListCategoriesQuery }), async (req, res) => {
  try {
    const { type } = req.query as unknown as z.infer<typeof ListCategoriesQuery>;

    const categories = await prisma.category.findMany({
      where: type ? { type } : undefined,
      include: {
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const mapped = categories.map((c) => ({ ...c, keywords: [] }));
    res.json(mapped);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching categories');
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/:id - Récupérer une catégorie par ID
router.get('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      }
    });
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ ...category, keywords: [] });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching category');
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST /api/categories - Créer une nouvelle catégorie
router.post('/', validate({ body: CreateCategoryBody }), async (req, res) => {
  try {
    const { name, type, color, icon } = req.body as z.infer<typeof CreateCategoryBody>;

    const category = await prisma.category.create({
      data: {
        name,
        type,
        color: color || '#6b7280',
        icon: icon ?? undefined,
      },
    });

    const withCounts = await prisma.category.findUnique({
      where: { id: category.id },
      include: { _count: { select: { transactions: true, budgets: true, recurrences: true } } },
    });

    res.status(201).json(withCounts ? { ...withCounts, keywords: [] } : null);
  } catch (error) {
    logger.error({ err: error }, 'Error creating category');
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Mettre à jour une catégorie
router.put('/:id', validate({ params: IdParam, body: UpdateCategoryBody }), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, color, icon } = req.body as z.infer<typeof UpdateCategoryBody>;

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(icon !== undefined ? { icon } : {}),
      },
      include: { _count: { select: { transactions: true, budgets: true, recurrences: true } } },
    });

    res.json({ ...updated, keywords: [] });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    logger.error({ err: error }, 'Error updating category');
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Supprimer une catégorie
router.delete('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier si la catégorie est utilisée
    const count = await prisma.category.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      }
    });
    
    if (count && (count._count.transactions > 0 || count._count.budgets > 0 || count._count.recurrences > 0)) {
      return res.status(400).json({ 
        error: 'Cannot delete category that is being used in transactions, budgets, or recurrences' 
      });
    }
    
    await prisma.category.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    logger.error({ err: error }, 'Error deleting category');
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// POST /api/categories/:id/apply-keywords - Désactivée (schéma non disponible)
router.post('/:id/apply-keywords', validate({ params: IdParam }), async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!category) return res.status(404).json({ error: 'Category not found' });
  return res.status(400).json({ error: 'Keywords functionality is not available in the current schema' });
});

export default router;
