import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/server/db", () => ({
  db: { payment: { findFirst: mocks.findFirst } },
}));

import { customerPaymentMatchesRequest, supplierPaymentMatchesRequest } from "@/lib/server/payment-idempotency";

const workspaceId = "0f2730ee-635b-4d5a-b95f-9282ab09a311";
const paymentId = "fcac35c8-c1a0-4228-8469-f57d003bb120";
const customerId = "baeb2480-12f3-4d4f-8e9b-90d0e90d3241";
const supplierId = "63b758e7-54e2-4d81-96ca-a057e59d64e8";
const accountId = "7b00af23-3b96-4e34-a672-3ca7da19ada1";
const invoiceId = "a5bfe672-4d0b-4373-b666-eb0bc6e4b58c";
const grnId = "1a2a66db-3b5d-4c59-a7a3-d1119039a33e";
const poId = "156e7b2a-ca11-45aa-be70-caa1978c13ea";
const paymentDate = new Date("2026-09-28T10:00:00.000Z");

const customerRequest = {
  customerId,
  invoiceId,
  cashBankAccountId: accountId,
  applyToOpeningBalance: false,
  amount: 100,
  withholdingTaxAmount: 5,
  paymentDate,
  method: "BANK_TRANSFER",
  reference: "BANK-123",
  notes: "September payment",
  idempotencyKey: "customer-payment-key",
};

const customerStored = {
  customerId,
  supplierId: null,
  invoiceId,
  cashBankAccountId: accountId,
  amount: new Prisma.Decimal(100),
  withholdingTaxAmount: new Prisma.Decimal(5),
  paymentDate,
  method: "BANK_TRANSFER",
  reference: "BANK-123",
  notes: "September payment",
  idempotencyKey: "customer-payment-key",
  allocations: [{ invoiceId, amount: new Prisma.Decimal(100), isCustomerOpeningBalance: false }],
};

const supplierRequest = {
  amount: 80,
  withholdingTaxAmount: 0,
  cashBankAccountId: accountId,
  allocations: [{ goodReceivedNoteId: grnId, openingBalance: false, amount: 80 }],
  method: "CASH",
  reference: "PV-REF",
  notes: "Supplier settlement",
  paymentDate,
  idempotencyKey: "supplier-payment-key",
};

const supplierStored = {
  customerId: null,
  supplierId,
  cashBankAccountId: accountId,
  amount: new Prisma.Decimal(80),
  withholdingTaxAmount: new Prisma.Decimal(0),
  paymentDate,
  method: "CASH",
  reference: "PV-REF",
  notes: "Supplier settlement",
  idempotencyKey: "supplier-payment-key",
  allocations: [{ purchaseOrderId: poId, goodReceivedNoteId: grnId, isSupplierOpeningBalance: false, amount: new Prisma.Decimal(80) }],
};

describe("payment idempotency request verification", () => {
  it("accepts an exact customer payment replay", async () => {
    mocks.findFirst.mockResolvedValueOnce(customerStored);
    await expect(customerPaymentMatchesRequest(workspaceId, paymentId, customerRequest)).resolves.toBe(true);
  });

  it("rejects customer metadata changes under the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(customerStored);
    await expect(customerPaymentMatchesRequest(workspaceId, paymentId, { ...customerRequest, paymentDate: new Date("2026-09-29T10:00:00.000Z") })).resolves.toBe(false);
  });

  it("rejects customer reference changes under the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(customerStored);
    await expect(customerPaymentMatchesRequest(workspaceId, paymentId, { ...customerRequest, reference: "BANK-999" })).resolves.toBe(false);
  });

  it("accepts an exact supplier payment replay", async () => {
    mocks.findFirst.mockResolvedValueOnce(supplierStored);
    await expect(supplierPaymentMatchesRequest(workspaceId, supplierId, paymentId, supplierRequest)).resolves.toBe(true);
  });

  it("rejects supplier note changes under the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(supplierStored);
    await expect(supplierPaymentMatchesRequest(workspaceId, supplierId, paymentId, { ...supplierRequest, notes: "Changed settlement" })).resolves.toBe(false);
  });
});
