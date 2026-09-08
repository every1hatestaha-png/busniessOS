"use strict";

require("dotenv").config({ path: require("node:path").resolve(__dirname, "../../.env.local") });

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

function withExplicitSslMode(url) {
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get("sslmode");
  if (!sslMode || ["prefer", "require", "verify-ca"].includes(sslMode)) parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

const adapter = new PrismaPg({ connectionString: withExplicitSslMode(connectionString) });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Generating visual QA test data...");

  // Create test user and workspace
  const user = await prisma.user.upsert({
    where: { clerkId: "visual-qa-user" },
    create: { clerkId: "visual-qa-user", email: "visual-qa@example.com", firstName: "Visual", lastName: "QA" },
    update: {},
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: "visual-qa-workspace" },
    create: {
      id: "visual-qa-workspace",
      name: "Visual QA Company Ltd.",
      phone: "+92 21 111 222 333",
      email: "accounts@visualqa.com",
      address: "123 Corporate Boulevard, Suite 400",
      city: "Karachi",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
      businessType: "MANUFACTURER",
      members: { create: { userId: user.id, role: "OWNER" } }
    },
    update: {
      name: "Visual QA Company Ltd.",
      phone: "+92 21 111 222 333",
      email: "accounts@visualqa.com",
      address: "123 Corporate Boulevard, Suite 400",
      city: "Karachi",
      country: "Pakistan",
    },
  });

  // Ensure default accounts
  await ensureDefaultAccounts(workspace.id);

  // Get system accounts
  const cashAccountGL = await getAccountByCode(workspace.id, "CASH_IN_HAND");
  const bankAccountGL = await getAccountByCode(workspace.id, "BANK");
  const expenseAccount = await getAccountByCode(workspace.id, "OFFICE_EXPENSE");

  // Create cash/bank accounts
  const cashAccount = await prisma.cashBankAccount.upsert({
    where: { workspaceId_accountId: { workspaceId: workspace.id, accountId: cashAccountGL.id } },
    create: { workspaceId: workspace.id, accountId: cashAccountGL.id, name: "Main Cash", openingBalance: 50000, currentBalance: 50000, isBank: false, isActive: true },
    update: {},
  });

  const bankAccount = await prisma.cashBankAccount.upsert({
    where: { workspaceId_accountId: { workspaceId: workspace.id, accountId: bankAccountGL.id } },
    create: { workspaceId: workspace.id, accountId: bankAccountGL.id, name: "Main Bank - HBL", openingBalance: 1000000, currentBalance: 1000000, isBank: true, bankName: "Habib Bank Limited", accountNumber: "0012-7901-1234-56", accountTitle: "Visual QA Company Ltd.", isActive: true },
    update: {},
  });

  // Create customers
  const customer1 = await prisma.customer.upsert({
    where: { id: "11111111-1111-4111-8111-111111111101" },
    create: { id: "11111111-1111-4111-8111-111111111101", workspaceId: workspace.id, name: "Acme Corporation Pvt Ltd", companyName: "Acme Corporation Pvt Ltd", address: "456 Business Park, Shahrah-e-Faisal", city: "Karachi", phone: "+92 21 3456 7890", email: "billing@acme.com", currentBalance: 0, creditLimit: 5000000, status: "ACTIVE" },
    update: {},
  });

  const customerLongName = await prisma.customer.upsert({
    where: { id: "11111111-1111-4111-8111-111111111102" },
    create: { id: "11111111-1111-4111-8111-111111111102", workspaceId: workspace.id, name: "Extremely Long Company Name That Tests Text Wrapping And Layout Stability In The Invoice Header And Address Sections Private Limited", companyName: "Extremely Long Company Name That Tests Text Wrapping And Layout Stability In The Invoice Header And Address Sections Private Limited", address: "Very Long Address Line That Spans Multiple Lines To Test Wrapping Behavior In The Invoice Layout And Address Block Rendering System Karachi Pakistan 75500", city: "Karachi", phone: "+92 21 3456 7890", email: "accounts@verylongcompany.com", currentBalance: 0, creditLimit: 10000000, status: "ACTIVE" },
    update: {},
  });

  // Create products
  const productPiece = await prisma.product.upsert({
    where: { id: "visual-qa-product-piece" },
    create: { id: "visual-qa-product-piece", workspaceId: workspace.id, name: "Widget Standard", sku: "WID-STD-001", description: "Standard widget for general use", category: "Widgets", unit: "PIECE", stockQuantity: 1000, costPrice: 150, sellingPrice: 250, reorderLevel: 50, status: "ACTIVE" },
    update: {},
  });

  const productLongDesc = await prisma.product.upsert({
    where: { id: "visual-qa-product-long" },
    create: { id: "visual-qa-product-long", workspaceId: workspace.id, name: "Super Deluxe Premium Ultra Widget With Extended Description That Tests Column Width And Text Wrapping In Tables", sku: "WID-DLX-LONG-001", description: "This is a very long product description that tests how the invoice and GRN tables handle text wrapping when product descriptions are extremely long and span multiple lines in the table cells", category: "Widgets", unit: "PIECE", stockQuantity: 500, costPrice: 500, sellingPrice: 850, reorderLevel: 25, status: "ACTIVE" },
    update: {},
  });

  const productWeight = await prisma.product.upsert({
    where: { id: "visual-qa-product-weight" },
    create: { id: "visual-qa-product-weight", workspaceId: workspace.id, name: "Basmati Rice Premium Grade", sku: "RICE-BAS-PREM", description: "Premium grade aged basmati rice", category: "Food Grains", unit: "KG", stockQuantity: 5000, costPrice: 180, sellingPrice: 280, reorderLevel: 500, status: "ACTIVE" },
    update: {},
  });

  const productWeightHeavy = await prisma.product.upsert({
    where: { id: "visual-qa-product-heavy" },
    create: { id: "visual-qa-product-heavy", workspaceId: workspace.id, name: "Steel Reinforcement Bars 20mm", sku: "STEEL-REBAR-20", description: "Grade 60 steel reinforcement bars for construction", category: "Construction Materials", unit: "KG", stockQuantity: 10000, costPrice: 220, sellingPrice: 285, reorderLevel: 1000, status: "ACTIVE" },
    update: {},
  });

  // Create suppliers
  const supplier1 = await prisma.supplier.upsert({
    where: { id: "33333333-3333-4333-8333-333333333301" },
    create: { id: "33333333-3333-4333-8333-333333333301", workspaceId: workspace.id, name: "Global Steel Industries Ltd", companyName: "Global Steel Industries Ltd", address: "789 Industrial Estate, Port Qasim", city: "Karachi", phone: "+92 21 9876 5432", email: "orders@globalsteel.com", currentBalance: 0 },
    update: {},
  });

  const supplierLong = await prisma.supplier.upsert({
    where: { id: "33333333-3333-4333-8333-333333333302" },
    create: { id: "33333333-3333-4333-8333-333333333302", workspaceId: workspace.id, name: "Extremely Long Supplier Name That Tests Procurement Document Layout And Supplier Address Block Rendering In Purchase Orders And Goods Receipt Notes Private Limited", companyName: "Extremely Long Supplier Name That Tests Procurement Document Layout And Supplier Address Block Rendering In Purchase Orders And Goods Receipt Notes Private Limited", address: "Very Long Supplier Address That Spans Multiple Lines To Test Wrapping In PO And GRN Documents Industrial Area Sector 7-B Karachi Pakistan 75010", city: "Karachi", phone: "+92 21 9876 5432", email: "procurement@verylongsupplier.com", currentBalance: 0 },
    update: {},
  });

  console.log("Test data generated successfully!");
  console.log("Workspace:", workspace.id);
  console.log("User:", user.id);
  console.log("Cash Account:", cashAccount.id);
  console.log("Bank Account:", bankAccount.id);
  console.log("Customers:", customer1.id, customerLongName.id);
  console.log("Products:", productPiece.id, productLongDesc.id, productWeight.id, productWeightHeavy.id);
  console.log("Suppliers:", supplier1.id, supplierLong.id);
  console.log("Expense Account:", expenseAccount.id);

  const ids = {
    workspaceId: workspace.id,
    userId: user.id,
    cashAccountId: cashAccount.id,
    bankAccountId: bankAccount.id,
    customer1Id: customer1.id,
    customerLongNameId: customerLongName.id,
    productPieceId: productPiece.id,
    productLongDescId: productLongDesc.id,
    productWeightId: productWeight.id,
    productWeightHeavyId: productWeightHeavy.id,
    supplier1Id: supplier1.id,
    supplierLongId: supplierLong.id,
    expenseAccountId: expenseAccount.id,
  };

  fs.writeFileSync(path.join(__dirname, "visual-qa-ids.json"), JSON.stringify(ids, null, 2));
  console.log("IDs saved to tests/visual-qa/visual-qa-ids.json");

  await prisma.$disconnect();
}

async function getAccountByCode(workspaceId, code) {
  return prisma.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: code } } });
}

async function ensureDefaultAccounts(workspaceId) {
  const codes = [
    "CASH_IN_HAND", "BANK", "ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE",
    "INVENTORY", "COST_OF_GOODS_SOLD", "SALES_REVENUE", "OFFICE_EXPENSE",
    "OTHER_INCOME", "WITHHOLDING_TAX_PAYABLE", "OWNER_EQUITY"
  ];

  for (const code of codes) {
    await prisma.account.upsert({
      where: { workspaceId_systemCode: { workspaceId, systemCode: code } },
      create: { workspaceId, code, name: code.replace(/_/g, " "), category: getCategory(code), normalBalance: getNormalBalance(code), systemCode: code, isActive: true },
      update: {},
    });
  }
}

function getCategory(code) {
  const map = {
    "CASH_IN_HAND": "ASSET", "BANK_ACCOUNT": "ASSET", "ACCOUNTS_RECEIVABLE": "ASSET",
    "INVENTORY": "ASSET", "ACCOUNTS_PAYABLE": "LIABILITY", "SALES_TAX_PAYABLE": "LIABILITY",
    "WITHHOLDING_TAX_PAYABLE": "LIABILITY", "OPENING_BALANCE_EQUITY": "EQUITY",
    "RETAINED_EARNINGS": "EQUITY", "COST_OF_GOODS_SOLD": "COST_OF_SALES",
    "SALES_REVENUE": "INCOME", "OFFICE_EXPENSE": "EXPENSE", "OTHER_INCOME": "INCOME"
  };
  return map[code] || "ASSET";
}

function getNormalBalance(code) {
  const debit = ["ASSET", "COST_OF_SALES", "EXPENSE"];
  const category = getCategory(code);
  return debit.includes(category) ? "DEBIT" : "CREDIT";
}

main().catch(e => { console.error(e); process.exit(1); });
