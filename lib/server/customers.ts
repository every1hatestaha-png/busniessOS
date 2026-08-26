import "server-only";

import type { CustomerInput } from "@/lib/validation/customer";
import { db } from "@/lib/server/db";

export type CustomerListItem = {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  creditLimit: number;
  currentBalance: number;
  status: "ACTIVE" | "INACTIVE" | "BLACKLISTED";
};

export type CustomerDetail = CustomerListItem & {
  address: string;
  notes: string;
  totalSales: number;
  totalPayments: number;
  ledgerEntries: Array<{
    id: string;
    date: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    date: string;
    status: "DRAFT" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED";
    total: number;
    balanceAmount: number;
  }>;
  payments: Array<{
    id: string;
    date: string;
    reference: string;
    method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CREDIT_CARD" | "MOBILE_WALLET";
    amount: number;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    dueDate: string | null;
    status: "DRAFT" | "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
    total: number;
    balance: number;
  }>;
};

export async function listCustomers(workspaceId: string): Promise<CustomerListItem[]> {
  const customers = await db.customer.findMany({
    where: { workspaceId },
    orderBy: [{ companyName: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      companyName: true,
      phone: true,
      email: true,
      city: true,
      creditLimit: true,
      currentBalance: true,
      status: true,
    },
  });

  return customers.map((customer) => ({
    ...customer,
    companyName: customer.companyName ?? customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    city: customer.city ?? "",
    creditLimit: Number(customer.creditLimit),
    currentBalance: Number(customer.currentBalance),
  }));
}

export async function getCustomer(workspaceId: string, id: string): Promise<CustomerDetail | null> {
  const customer = await db.customer.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      name: true,
      companyName: true,
      phone: true,
      email: true,
      city: true,
      address: true,
      notes: true,
      creditLimit: true,
      currentBalance: true,
      status: true,
      salesOrders: {
        where: { workspaceId },
        orderBy: { orderDate: "desc" },
        select: { id: true, orderNumber: true, orderDate: true, status: true, total: true, balanceAmount: true },
      },
      payments: {
        where: { workspaceId },
        orderBy: { paymentDate: "desc" },
        select: { id: true, paymentDate: true, reference: true, method: true, amount: true },
      },
      invoices: {
        where: { workspaceId },
        orderBy: { issuedAt: "desc" },
        select: { id: true, invoiceNumber: true, issuedAt: true, dueDate: true, status: true, amount: true, paidAmount: true },
      },
      ledgerEntries: {
        where: { workspaceId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true, date: true, referenceId: true, description: true, debit: true, credit: true },
      },
    },
  });

  if (!customer) return null;

  const orders = customer.salesOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    date: order.orderDate.toISOString(),
    status: order.status,
    total: Number(order.total),
    balanceAmount: Number(order.balanceAmount),
  }));
  const payments = customer.payments.map((payment) => ({
    id: payment.id,
    date: payment.paymentDate.toISOString(),
    reference: payment.reference ?? "-",
    method: payment.method,
    amount: Number(payment.amount),
  }));

  return {
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName ?? customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    city: customer.city ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
    creditLimit: Number(customer.creditLimit),
    currentBalance: Number(customer.currentBalance),
    status: customer.status,
    totalSales: orders.reduce((total, order) => total + order.total, 0),
    totalPayments: payments.reduce((total, payment) => total + payment.amount, 0),
    orders,
    payments,
    invoices: customer.invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.issuedAt.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      status: invoice.status,
      total: Number(invoice.amount),
      balance: Number(invoice.amount) - Number(invoice.paidAmount),
    })),
    ledgerEntries: customer.ledgerEntries.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      reference: entry.referenceId ?? "-",
      description: entry.description ?? "",
      debit: Number(entry.debit),
      credit: Number(entry.credit),
    })),
  };
}

export async function createCustomer(workspaceId: string, input: CustomerInput): Promise<string> {
  const openingBalance = input.openingBalance;

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        workspaceId,
        name: input.name,
        companyName: input.companyName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        address: input.address,
        creditLimit: input.creditLimit,
        currentBalance: openingBalance,
        status: input.status,
        notes: input.notes || null,
      },
      select: { id: true },
    });

    if (Number(openingBalance) > 0) {
      await tx.ledgerEntry.create({
        data: {
          workspaceId,
          customerId: customer.id,
          type: "OPENING_BALANCE",
          debit: openingBalance,
          description: "Customer opening balance",
        },
      });
    }

    return customer.id;
  });
}
