import "server-only";

import { startOfMonth } from "date-fns";
import { db } from "@/lib/server/db";
import { getCreditStatus } from "@/lib/utils";

export async function getKhataSummary(workspaceId: string) {
  const [customers, monthPayments, overdueInvoices] = await Promise.all([
    db.customer.findMany({ where: { workspaceId }, orderBy: [{ currentBalance: "desc" }], include: { salesOrders: { select: { total: true } }, payments: { select: { amount: true } } } }),
    db.payment.aggregate({ where: { workspaceId, customerId: { not: null }, paymentDate: { gte: startOfMonth(new Date()) } }, _sum: { amount: true } }),
    db.invoice.findMany({ where: { workspaceId, dueDate: { lt: new Date() }, status: { in: ["UNPAID", "PARTIALLY_PAID", "OVERDUE"] } }, select: { customerId: true, amount: true, paidAmount: true } }),
  ]);
  const overdueCustomers = new Set(overdueInvoices.map((invoice) => invoice.customerId));
  return { totalReceivables: customers.reduce((sum, customer) => sum + Number(customer.currentBalance), 0), customersWithBalance: customers.filter((customer) => customer.currentBalance.greaterThan(0)).length, overdueAmount: overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.amount) - Number(invoice.paidAmount), 0), paymentsThisMonth: Number(monthPayments._sum.amount ?? 0), customers: customers.map((customer) => { const outstanding = Number(customer.currentBalance); const creditLimit = Number(customer.creditLimit); return { id: customer.id, name: customer.companyName ?? customer.name, phone: customer.phone ?? "", totalSales: customer.salesOrders.reduce((sum, sale) => sum + Number(sale.total), 0), totalPaid: customer.payments.reduce((sum, payment) => sum + Number(payment.amount), 0), outstanding, creditLimit, status: overdueCustomers.has(customer.id) ? "Overdue" as const : getCreditStatus(outstanding, creditLimit) }; }) };
}
