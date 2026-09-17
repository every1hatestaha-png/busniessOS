import "server-only";

import { Prisma } from "@prisma/client";

export class CustomerPaymentAccountingError extends Error {}

async function getWithholdingTaxReceivableAccount(tx: Prisma.TransactionClient, workspaceId: string) {
  const existingByName = await tx.account.findFirst({
    where: { workspaceId, name: { equals: "Withholding Tax Receivable", mode: "insensitive" } },
    select: { id: true, category: true, normalBalance: true, isActive: true },
  });
  if (existingByName) {
    if (existingByName.category !== "ASSET" || existingByName.normalBalance !== "DEBIT") {
      throw new CustomerPaymentAccountingError("The existing Withholding Tax Receivable account is not configured as a debit-normal asset.");
    }
    if (!existingByName.isActive) {
      return tx.account.update({ where: { id: existingByName.id }, data: { isActive: true }, select: { id: true } });
    }
    return existingByName;
  }

  const codeOwner = await tx.account.findUnique({
    where: { workspaceId_code: { workspaceId, code: "1110" } },
    select: { id: true, name: true },
  });
  if (codeOwner) {
    throw new CustomerPaymentAccountingError(`Account code 1110 is already used by ${codeOwner.name}. Rename that account or create an asset named Withholding Tax Receivable.`);
  }

  return tx.account.create({
    data: {
      workspaceId,
      code: "1110",
      name: "Withholding Tax Receivable",
      category: "ASSET",
      normalBalance: "DEBIT",
      isActive: true,
    },
    select: { id: true },
  });
}

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
    ? await getWithholdingTaxReceivableAccount(tx, params.workspaceId)
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
