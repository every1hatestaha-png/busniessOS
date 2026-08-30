import { z } from "zod";

export const cashBankAccountSchema = z.object({
  name: z.string().trim().min(1),
  openingBalance: z.coerce.number().min(0).default(0),
  isBank: z.boolean().default(false),
  bankName: z.string().trim().optional().nullable(),
  accountTitle: z.string().trim().max(160).optional().nullable(),
  accountNumber: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const expenseSchema = z.object({
  expenseAccountId: z.string().uuid(),
  paymentAccountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  expenseDate: z.coerce.date(),
  payee: z.string().trim().optional().nullable(),
  reference: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  idempotencyKey: z.string().trim().optional().nullable(),
});

export const ledgerReportSchema = z.object({
  accountId: z.string().uuid(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(120).optional(),
});

export const profitLossSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CashBankAccountInput = z.infer<typeof cashBankAccountSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type LedgerReportInput = z.infer<typeof ledgerReportSchema>;
export type ProfitLossInput = z.infer<typeof profitLossSchema>;
