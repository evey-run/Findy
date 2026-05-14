import { z } from 'zod';

export const CreateObjectiveBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  targetAmount: z.coerce.number().positive(),
  deadline: z.string().optional().nullable(),
  isCompleted: z.boolean().optional(),
});

export const UpdateObjectiveBody = CreateObjectiveBody.partial();
