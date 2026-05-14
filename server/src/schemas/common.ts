import { z } from 'zod';

// CUIDs Prisma ont une longueur variable (>= ~24). On valide juste qu'on a une string non vide
// puisque z.string().cuid() de Zod cible les CUID v1 strictement (Prisma émet du cuid v2).
export const IdString = z.string().trim().min(8).max(64);

export const IdParam = z.object({ id: IdString });

export const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color');

export const AccountType = z.enum(['CURRENT', 'SAVINGS', 'INVESTMENT']);
export const CategoryType = z.enum(['INCOME', 'EXPENSE', 'FIXED']);
export const BudgetPeriod = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
export const RecurrenceFrequency = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

// Coercions depuis querystring (où tout est string)
export const BoolFromString = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
  .optional();

export const DateFromString = z
  .union([z.string().datetime({ offset: true }), z.string().date(), z.string().min(1)])
  .transform((v, ctx) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Invalid date' });
      return z.NEVER;
    }
    return d;
  });

export const IntFromString = z.coerce.number().int();
export const NumberFromString = z.coerce.number();
