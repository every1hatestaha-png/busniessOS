import "server-only";

import { Prisma } from "@prisma/client";

export class CustomerPaymentAccountingError extends Error {}

export async function postCustomerReceiptWithWht(
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    paymentId: string;
    documentNo: string;
    date: Date;
    grossAmount: Prisma.Decimal;
    withholdingTaxAmount: Prisma.Decimal;
    cashBankAccountId: string;
  },
) {
  if (params.withholdingTaxAmount.lessThan(0)) throw new CustomerPaymentAccountingError("Withholding tax cannot be negative.");
  if (params.withholdingTaxAmount.greaterThan(params.grossAmount)) throw new CustomerPaymentAccountingError("Withholding tax cannot exceed the gross settlement amount.");

  const netAmount = params.grossAmount.minus(params.withholdingTaxAmount);
  const cashBank = await tx.cashBankAccount.findFirst({
    where: { id: params.cashBankAccountId, workspaceId: params.workspaceId, isActive: true },
    select: { id: true, accountId: true },
  });
  if (!cashBank) throw new CustomerPaymentAccountingError("Cash/bank account is unavailable.");

  const receivable = await tx.account.findUnique({
    where: { workspaceId_systemCode: { workspaceId: params.workspaceId, systemCode: "ACCOUNTS_RECEIVABLE" } },
    select: { id: true },
  });
  if (!receivable) throw new CustomerPaymentAccountingError("Accounts Receivable account is unavailable.");

  const whtReceivable = params.withholdingTaxAmount.greaterThan(0)
    ? await tx.account.upsert({
        where: { workspaceId_code: { workspaceId: params.workspaceId, code: "1110" } },
        create: {
          workspaceId: params.workspaceId,
          code: "1110",
          name: "Withholding Tax Receivable",
          category: "ASSET",
          normalBalance: "DEBIT",
          isActive: true,
        },
        update: { name: "Withholding Tax Receivable", category: "ASSET", normalBalance: "DEBIT", isActive: true },
        select: { id: true },
      })
    : null;

  const entries: Prisma.GeneralLedgerEntryCreateManyInput[] = [];
  if (netAmount.greaterThan(0)) {
    entries.push({
      workspaceId: params.workspaceId,
      accountId: cashBank.accountId,
      sourceType: "RECEIPT",
      sourceId: params.paymentId,
      documentNo: params.documentNo,
      date: params.date,
      narration: `Customer receipt ${params.documentNo}`,
      debit: netAmount,
      credit: 0,
    });
  }
  if (params.withholdingTaxAmount.greaterThan(0) && whtReceivable) {
    entries.push({
      workspaceId: params.workspaceId,
      accountId: whtReceivable.id,
      sourceType: "RECEIPT",
      sourceId: params.paymentId,
      documentNo: params.documentNo,
      date: params.date,
      narration: `Customer WHT receivable ${params.documentNo}`,
      debit: params.withholdingTaxAmount,
      credit: 0,
    });
  }
  entries.push({
    workspaceId: params.workspaceId,
    accountId: receivable.id,
    sourceType: "RECEIPT",
    sourceId: params.paymentId,
    documentNo: params.documentNo,
    date: params.date,
    narration: `Customer receipt ${params.documentNo}`,
    debit: 0,
    credit: params.grossAmount,
  });

  const debits = entries.reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.debit?.toString() ?? 0)), new Prisma.Decimal(0));
  const credits = entries.reduce((sum, entry) => sum.plus(new Prisma.Decimal(entry.credit?.toString() ?? 0)), new Prisma.Decimal(0));
  if (!debits.equals(credits)) throw new CustomerPaymentAccountingError("Customer receipt GL posting is not balanced.");

  await tx.generalLedgerEntry.createMany({ data: entries });
  if (netAmount.greaterThan(0)) {
    await tx.cashBankAccount.update({
      where: { id: cashBank.id, workspaceId: params.workspaceId },
      data: { currentBalance: { increment: netAmount } },
    });
  }

  return { netAmount };
}
