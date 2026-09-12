import { SalesOrderFormTax } from "@/components/sales/sales-order-form-tax";
import { canPerformAction, requirePermission } from "@/lib/server/authorization";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { db } from "@/lib/server/db";

export default async function NewSalePage() {
  const { workspaceId, role } = await requirePermission("sales.create");
  const canRecordPayments = canPerformAction(role, "payments.record");

  const [customerRows, productRows, cashBankAccounts] = await Promise.all([
    db.customer.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      select: { id: true, name: true, companyName: true, phone: true, creditLimit: true, currentBalance: true, status: true },
    }),
    db.product.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, sku: true, sellingPrice: true, stockQuantity: true, status: true, unit: true, defaultWeightKg: true },
    }),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
  ]);

  const customers = customerRows.map((customer) => ({
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName ?? customer.name,
    phone: customer.phone ?? "",
    creditLimit: Number(customer.creditLimit),
    currentBalance: Number(customer.currentBalance),
    status: customer.status,
  }));

  const products = productRows.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku ?? "",
    sellingPrice: Number(product.sellingPrice),
    stockQuantity: Number(product.stockQuantity),
    status: product.status,
    unit: product.unit,
    defaultWeightKg: product.defaultWeightKg ? Number(product.defaultWeightKg) : null,
  }));

  return <SalesOrderFormTax customers={customers} products={products} cashBankAccounts={cashBankAccounts} canRecordPayments={canRecordPayments} />;
}
