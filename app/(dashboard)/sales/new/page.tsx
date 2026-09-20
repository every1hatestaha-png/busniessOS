import { SalesOrderForm } from "@/components/sales/sales-order-form";
import { canPerformAction, requirePermission } from "@/lib/server/authorization";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { db } from "@/lib/server/db";
import { getWarehouseStockMode, listActiveStockWarehouses } from "@/lib/server/managed-warehouse-stock";

export default async function NewSalePage() {
  const { workspaceId, role } = await requirePermission("sales.create");
  const canRecordPayments = canPerformAction(role, "payments.record");

  // Keep this high-frequency screen lean: fetch only active records and only the
  // columns the form renders instead of serializing full customer/product DTOs.
  const warehouseMode = await getWarehouseStockMode(workspaceId);
  const [customerRows, productRows, cashBankAccounts, warehouses, warehouseStocks, priceRuleRows] = await Promise.all([
    db.customer.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      select: { id: true, name: true, companyName: true, phone: true, creditLimit: true, currentBalance: true, status: true },
    }),
    db.product.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        stockQuantity: true,
        status: true,
        unit: true,
        defaultWeightKg: true,
        fbrRateDesc: true,
        fbrRateValue: true,
        fbrReferenceVerifiedAt: true,
      },
    }),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
    warehouseMode === "MANAGED" ? listActiveStockWarehouses(workspaceId) : Promise.resolve([]),
    warehouseMode === "MANAGED"
      ? db.$queryRaw<Array<{ warehouseId: string; productId: string; quantity: string }>>`
          SELECT "warehouseId"::text AS "warehouseId", "productId"::text AS "productId", "quantity"::text AS "quantity"
          FROM "warehouse_stocks"
          WHERE "workspaceId"=${workspaceId}::uuid
        `
      : Promise.resolve([]),
    db.customerPriceRule.findMany({
      where: { workspaceId, isActive: true },
      select: { customerId: true, productId: true, minQuantity: true, unitPrice: true, discountPerUnit: true, isActive: true },
    }),
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
  const products = productRows.map((product) => {
    const rateValue = product.fbrRateValue ? Number(product.fbrRateValue) : null;
    const rateMatch = product.fbrRateDesc?.trim().match(/^(\d+(?:\.\d+)?)%$/);
    const verifiedTaxRate = product.fbrReferenceVerifiedAt && rateValue !== null && rateMatch
      && Math.abs(Number(rateMatch[1]) - rateValue) < 0.0001
      ? rateValue
      : null;
    return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? "",
    sellingPrice: Number(product.sellingPrice),
    stockQuantity: Number(product.stockQuantity),
    status: product.status,
    unit: product.unit,
    defaultWeightKg: product.defaultWeightKg ? Number(product.defaultWeightKg) : null,
    verifiedTaxRate,
  };
  });

  return <SalesOrderForm
    customers={customers}
    products={products}
    cashBankAccounts={cashBankAccounts}
    canRecordPayments={canRecordPayments}
    warehouseMode={warehouseMode}
    warehouses={warehouses}
    warehouseStocks={warehouseStocks.map((stock) => ({ ...stock, quantity: Number(stock.quantity) }))}
    priceRules={priceRuleRows.map((rule) => ({
      customerId: rule.customerId,
      productId: rule.productId,
      minQuantity: Number(rule.minQuantity),
      unitPrice: Number(rule.unitPrice),
      discountPerUnit: Number(rule.discountPerUnit),
      isActive: rule.isActive,
    }))}
  />;
}
