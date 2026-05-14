import { z } from 'zod';
import { IdString, DateFromString, IntFromString } from './common';

export const OverviewQuery = z.object({
  userId: IdString.optional(),
  startDate: DateFromString.optional(),
  endDate: DateFromString.optional(),
});

export const MonthlyTrendsQuery = z.object({
  userId: IdString.optional(),
  months: IntFromString.min(1).max(60).optional(),
});

export const BudgetStatusQuery = z.object({
  userId: IdString.optional(),
});
