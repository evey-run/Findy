import { z } from 'zod';
import { IdString, RecurrenceFrequency, BoolFromString } from './common';

export const ListRecurrencesQuery = z.object({
  bankId: IdString.optional(),
  categoryId: IdString.optional(),
  active: BoolFromString,
});

export const CreateRecurrenceBody = z.object({
  amount: z.coerce.number(),
  frequency: RecurrenceFrequency.optional(),
  nextDue: z.string().min(1),
  description: z.string().trim().min(1).max(500),
  active: z.boolean().optional(),
  bankId: IdString.nullable().optional(),
  categoryId: IdString,
});

export const UpdateRecurrenceBody = CreateRecurrenceBody.partial();
