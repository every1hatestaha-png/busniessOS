import "server-only";

import { db } from "@/lib/server/db";
import { requireWorkspaceModule } from "@/lib/server/industry-modules";

/**
 * Read-only: do not initialize ledger/accounts as a side effect of a cashier GET.
 * Cashier station uses only an account selector. Never query or serialize
 * the private ledger balance, bank account number, account holder or notes.
 * The payment mutation still checks the real account kind, workspace,
 * active state, current cash shift and posting rules under a transaction.
 */
export async function listRestaurantCollectionAccountChoices(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const accounts = await db.cashBankAccount.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true, name: true, isBank: true },
    orderBy: { name: "asc" },
  });
  return accounts.map(({ id, name, isBank }) => ({
    cashBankAccountId: id, name, isBank,
  }));
}
