"use strict";

require("dotenv").config({ path: require("node:path").resolve(__dirname, "../../.env.local") });

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient, Prisma } = require("@prisma/client");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

function withExplicitSslMode(url) {
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || ["prefer", "require", "verify-ca"].includes(sslMode)) parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: withExplicitSslMode(connectionString) }) });
const fixtureIdsPath = path.join(__dirname, "visual-qa-ids.json");
const documentIdsPath = path.join(__dirname, "visual-qa-document-ids.json");
const fixtureIds = JSON.parse(fs.readFileSync(fixtureIdsPath, "utf8"));
const documentIds = JSON.parse(fs.readFileSync(documentIdsPath, "utf8"));

if (fixtureIds.workspaceId !== "visual-qa-workspace") throw new Error("Refusing to generate fixtures outside visual-qa-workspace.");

async function main() {
  const workspaceId = fixtureIds.workspaceId;
  const invoiceId = documentIds.invoices?.["5-line"] || documentIds.invoices?.["1-line"];
  if (!invoiceId) throw new Error("Run generate-documents.js first so an invoice fixture exists.");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: { salesOrder: { include: { items: true } } },
  });
  if (!invoice?.salesOrder) throw new Error("Visual QA invoice has no linked sale.");

  const order = invoice.salesOrder;
  const existing = await prisma.customerReturn.findFirst({
    where: { workspaceId, salesOrderId: order.id, number: { startsWith: "CR-VQA-" } },
    include: { creditNote: true },
  });

  let customerReturn = existing;
  if (!customerReturn) {
    const selectedItems = order.items.slice(0, 2);
    if (!selectedItems.length) throw new Error("Visual QA sale has no line items for customer return fixture.");
    const returnLines = selectedItems.map((item, index) => {
      const quantity = index === 0 ? new Prisma.Decimal(1) : Prisma.Decimal.min(item.quantity, new Prisma.Decimal("0.5"));
      const unitPrice = item.totalPrice.div(item.quantity);
      return { source: item, quantity, unitPrice, totalPrice: unitPrice.mul(quantity).toDecimalPlaces(2) };
    });
    const totalAmount = returnLines.reduce((sum, line) => sum.plus(line.totalPrice), new Prisma.Decimal(0));

    customerReturn = await prisma.customerReturn.create({
      data: {
        workspaceId,
        customerId: order.customerId,
        salesOrderId: order.id,
        number: `CR-VQA-${randomUUID().slice(0, 8)}`,
        reason: "Visual QA customer return with long enough explanatory text to verify wrapping and document spacing.",
        totalAmount,
        restock: true,
        notes: "Customer returned inspected goods. Credit note remains open for print verification.",
        items: {
          create: returnLines.map((line) => ({
            salesOrderItemId: line.source.id,
            productId: line.source.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: line.totalPrice,
          })),
        },
      },
    });

    await prisma.creditNote.create({
      data: {
        workspaceId,
        customerId: order.customerId,
        salesOrderId: order.id,
        customerReturnId: customerReturn.id,
        number: `CN-VQA-${randomUUID().slice(0, 8)}`,
        reason: "Customer return visual QA",
        amount: totalAmount,
        appliedAmount: 0,
        remainingAmount: totalAmount,
        status: "OPEN",
        reference: customerReturn.number,
        notes: "Open credit note generated for print completeness fixture.",
      },
    });
  }

  documentIds.customerReturn = customerReturn.id;
  documentIds.reports = {
    ...(documentIds.reports || {}),
    productId: fixtureIds.productPieceId,
  };
  fs.writeFileSync(documentIdsPath, JSON.stringify(documentIds, null, 2));
  console.log("Print-completeness fixtures updated:", documentIdsPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
