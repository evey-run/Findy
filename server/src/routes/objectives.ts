import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validate } from '../middlewares/validate';
import { IdParam } from '../schemas/common';
import { CreateObjectiveBody, UpdateObjectiveBody } from '../schemas/objectives';
import type { z } from 'zod';

const router = express.Router();

// Récupérer tous les objectifs
router.get('/', async (req, res) => {
  try {
    const objectives = await prisma.objective.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(objectives);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching objectives');
    res.status(500).json({ error: 'Failed to fetch objectives' });
  }
});

// Récupérer un objectif spécifique
router.get('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const objective = await prisma.objective.findUnique({
      where: { id: req.params.id }
    });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }
    res.json(objective);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching objective');
    res.status(500).json({ error: 'Failed to fetch objective' });
  }
});

// Récupérer la progression d'un objectif
router.get('/:id/progress', validate({ params: IdParam }), async (req, res) => {
  try {
    const objective = await prisma.objective.findUnique({
      where: { id: req.params.id }
    });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    // Récupérer les transactions liées à cet objectif
    // Nous cherchons des transactions dont la description contient le titre de l'objectif
    // ou des mots clés comme "économie" ou "épargne" suivis du titre
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { description: { contains: objective.title } },
          { description: { contains: `economie ${objective.title}` } },
          { description: { contains: `économie ${objective.title}` } },
          { description: { contains: `epargne ${objective.title}` } },
          { description: { contains: `épargne ${objective.title}` } }
        ]
      },
      orderBy: { date: 'desc' }
    });

    // Calculer le montant total économisé
    const totalSaved = transactions.reduce((sum, transaction) => {
      // On ne compte que les transactions positives (dépôts)
      if (transaction.amount > 0) {
        return sum + transaction.amount;
      }
      return sum;
    }, 0);

    // Calculer le pourcentage de progression
    const percentage = Math.min(100, (totalSaved / objective.targetAmount) * 100);
    
    // Calculer le montant restant à économiser
    const remaining = Math.max(0, objective.targetAmount - totalSaved);
    
    // Déterminer si l'objectif est complété
    const isCompleted = percentage >= 100;

    // Récupérer les transactions récentes (3 dernières)
    const recentTransactions = transactions.slice(0, 3);

    // Retourner les informations de progression
    res.json({
      objective,
      transactions,
      totalSaved,
      remaining,
      percentage,
      isCompleted,
      searchPattern: `%${objective.title}%`,
      recentTransactions
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching objective progress');
    res.status(500).json({ error: 'Failed to fetch objective progress' });
  }
});

// Créer un nouvel objectif
router.post('/', validate({ body: CreateObjectiveBody }), async (req, res) => {
  try {
    const body = req.body as z.infer<typeof CreateObjectiveBody>;
    const now = new Date();

    const newObjective = await prisma.objective.create({
      data: {
        id: uuidv4(),
        title: body.title,
        description: body.description ?? '',
        targetAmount: body.targetAmount,
        deadline: body.deadline ? new Date(body.deadline) : null,
        isCompleted: body.isCompleted ?? false,
        createdAt: now,
        updatedAt: now,
      },
    });
    res.status(201).json(newObjective);
  } catch (error) {
    logger.error({ err: error }, 'Error creating objective');
    res.status(500).json({ error: 'Failed to create objective' });
  }
});

// Mettre à jour un objectif
router.put('/:id', validate({ params: IdParam, body: UpdateObjectiveBody }), async (req, res) => {
  try {
    const body = req.body as z.infer<typeof UpdateObjectiveBody>;
    const { id } = req.params;

    const objective = await prisma.objective.findUnique({ where: { id } });
    if (!objective) return res.status(404).json({ error: 'Objective not found' });

    const updatedObjective = await prisma.objective.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description ?? '' } : {}),
        ...(body.targetAmount !== undefined ? { targetAmount: body.targetAmount } : {}),
        ...(body.deadline !== undefined
          ? { deadline: body.deadline ? new Date(body.deadline) : null }
          : {}),
        ...(body.isCompleted !== undefined ? { isCompleted: body.isCompleted } : {}),
      },
    });
    res.json(updatedObjective);
  } catch (error) {
    logger.error({ err: error }, 'Error updating objective');
    res.status(500).json({ error: 'Failed to update objective' });
  }
});

// Supprimer un objectif
router.delete('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    
    const objective = await prisma.objective.findUnique({
      where: { id }
    });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    await prisma.objective.delete({
      where: { id }
    });
    res.json({ message: 'Objective deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting objective');
    res.status(500).json({ error: 'Failed to delete objective' });
  }
});

export default router;
