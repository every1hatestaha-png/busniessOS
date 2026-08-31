import "server-only";

import { db } from "@/lib/server/db";
import { businessMonthStart } from "@/lib/server/business-time";
import { getReceivablesAging } from "@/lib/server/receivables";
import { getCreditStatus } from "@/lib/utils";

export async function getKhataSummary(workspaceId: string) {
  const [customers, monthPayments, overdueInvoices, receivables] = await Promise.all([
    db.customer.findMany({ where: { workspaceId }, orderBy: [{ currentBalance: "desc" }], include: { salesOrders: { where: { status: { not: "CANCELLED" } }, select: { total: true } }, payments: { where: { isReversed: false, reversalOfId: null }, select: { amount: true } } } }),
    db.payment.aggregate({ where: { workspaceId, customerId: { not: null }, isReversed: false, reversalOfId: null, paymentDate: { gte: businessMonthStart(new Date()) } }, _sum: { amount: true } }),
    db.invoice.findMany({ where: { workspaceId, dueDate: { lt: new Date() }, status: { in: ["UNPAID", "PARTIALLY_PAID", "OVERDUE"] } }, select: { customerId: true, amount: true, paidAmount: true, creditApplied: true } }),
    getReceivablesAging(workspaceId),
  ]);
  const overdueCustomers = new Set(overdueInvoices.map((invoice) => invoice.customerId));
  const outstandingByCustomer = new Map(receivables.customers.map((customer) => [customer.customerId, customer.totalOutstanding]));
  return { totalReceivables: receivables.totalOutstanding, customersWithBalance: receivables.customers.filter((customer) => customer.totalOutstanding > 0).length, overdueAmount: overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.amount) - Number(invoice.paidAmount) - Number(invoice.creditApplied), 0), paymentsThisMonth: Number(monthPayments._sum.amount ?? 0), customers: customers.map((customer) => { const outstanding = outstandingByCustomer.get(customer.id) ?? 0; const creditLimit = Number(customer.creditLimit); return { id: customer.id, name: customer.companyName ?? customer.name, phone: customer.phone ?? "", totalSales: customer.salesOrders.reduce((sum, sale) => sum + Number(sale.total), 0), totalPaid: customer.payments.reduce((sum, payment) => sum + Number(payment.amount), 0), outstanding, creditLimit, status: overdueCustomers.has(customer.id) ? "Overdue" as const : getCreditStatus(outstanding, creditLimit) }; }) };
}
