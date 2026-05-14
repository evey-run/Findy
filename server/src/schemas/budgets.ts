import { z } from 'zod';
import { IdString, BudgetPeriod, BoolFromString } from './common';

export const ListBudgetsQuery = z.object({
  categoryId: IdString.optional(),
  shared: BoolFromString,
});

export const CreateBudgetBody = z.object({
  amount: z.coerce.number().positive(),
  period: BudgetPeriod.optional(),
  startDate: z.string().optional(),
  shared: z.boolean().optional(),
  bankId: IdString.nullable().optional(),
  categoryId: IdString,
});

export const UpdateBudgetBody = CreateBudgetBody.partial();
