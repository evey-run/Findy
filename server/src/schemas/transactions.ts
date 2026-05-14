import { z } from 'zod';
import {
  IdString,
  AccountType,
  BoolFromString,
  DateFromString,
  IntFromString,
  NumberFromString,
} from './common';

export const ListTransactionsQuery = z.object({
  bankId: IdString.optional(),
  categoryId: z.string().optional(),
  shared: BoolFromString,
  startDate: DateFromString.optional(),
  endDate: DateFromString.optional(),
  limit: IntFromString.min(1).max(1000).optional(),
  offset: IntFromString.min(0).optional(),
  search: z.string().trim().optional(),
  accountType: AccountType.optional(),
});

export const StatsSummaryQuery = z.object({
  bankId: IdString.optional(),
  startDate: DateFromString.optional(),
  endDate: DateFromString.optional(),
});

export const CreateTransactionBody = z.object({
  amount: NumberFromString.refine((n) => Number.isFinite(n), 'amount must be finite'),
  description: z.string().trim().min(1).max(500),
  date: z.union([z.string(), z.date()]).optional(),
  bankId: IdString,
  categoryId: IdString.optional().nullable(),
  unitPrice: NumberFromString.optional().nullable(),
  quantity: NumberFromString.optional().nullable(),
});

export const UpdateTransactionBody = z
  .object({
    amount: NumberFromString.optional(),
    description: z.string().trim().min(1).max(500).optional(),
    date: z.union([z.string(), z.date()]).optional(),
    shared: z.boolean().optional(),
    categoryId: IdString.nullable().optional(),
    bankId: IdString.optional(),
    unitPrice: NumberFromString.nullable().optional(),
    quantity: NumberFromString.nullable().optional(),
  })
  .strict();

const BulkFilters = z.object({
  searchText: z.string().optional(),
  categoryId: z.string().optional(),
  bankId: IdString.optional(),
  checked: z.enum(['true', 'false', '']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const BulkActions = z.object({
  replaceText: z
    .object({
      enabled: z.boolean(),
      from: z.string().optional(),
      to: z.string().optional(),
      replaceAll: z.boolean().optional(),
    })
    .optional(),
  changeCategory: z
    .object({ enabled: z.boolean(), categoryId: z.string().optional() })
    .optional(),
  changeChecked: z.object({ enabled: z.boolean(), checked: z.boolean().optional() }).optional(),
  changeBank: z.object({ enabled: z.boolean(), bankId: IdString.optional() }).optional(),
});

export const BulkUpdateBody = z.object({
  filters: BulkFilters,
  actions: BulkActions,
});

export const SearchTransactionsBody = BulkFilters;
