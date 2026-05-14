import { z } from 'zod';
import { CategoryType, HexColor } from './common';

export const ListCategoriesQuery = z.object({
  type: CategoryType.optional(),
});

export const CreateCategoryBody = z.object({
  name: z.string().trim().min(1).max(100),
  type: CategoryType,
  color: HexColor.optional(),
  icon: z.string().trim().max(100).nullable().optional(),
});

export const UpdateCategoryBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  type: CategoryType.optional(),
  color: HexColor.optional(),
  icon: z.string().trim().max(100).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(100)).optional(),
});

export const ApplyKeywordsBody = z.object({
  keywords: z.array(z.string().trim().min(1).max(100)).min(1),
});
