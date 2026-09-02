# BusinessOS

BusinessOS is a multi-tenant business operations workspace for Pakistani wholesalers and distributors. It brings sales, purchasing, inventory, accounting/GL, receivables/payables aging, reporting, and an AI-style business assistant into one responsive interface.

## Current Architecture

- Next.js App Router with server pages and focused client components for interactive tables and forms
- TypeScript in strict mode
- Tailwind CSS and shadcn/Base UI primitives
- Clerk provider and route-protection structure for production authentication
- Prisma/PostgreSQL schema with workspace-scoped business records
- Server-only Prisma repositories for all domains: customers, suppliers, products, sales, purchasing, GRN, supplier returns, payments, invoices, accounting/GL, payables aging, receivables aging, expenses, reports, and dashboard
- Weight-based and piece-based GRN with decimal quantities and weighted-average costing
- Complete purchase return workflow with GRN linking, status lifecycle, and debit note generation
- Product form with unsaved draft persistence (localStorage) for seamless creation/editing
- Financial and business calculations in `lib/utils.ts` and `lib/accounting-math.ts`
- Serializable transaction isolation with P2028/P2034 retry for concurrent operations
- Provider-independent assistant contract in `lib/business-assistant.ts`

## Tech Stack

- Next.js 16 and React 19
- TypeScript 5
- Tailwind CSS 4
- shadcn/ui with Base UI
- Clerk
- Prisma 7 with `@prisma/adapter-pg` and Neon PostgreSQL
- React Hook Form and Zod
- Lucide icons
- Vitest for integration testing

## Persistence Status

All business domains are fully transactional against Neon PostgreSQL:

- **Customers** — full CRUD, credit management, aging, statements
- **Suppliers** — full CRUD, balance tracking, payment allocation, aging, statements
- **Products/Inventory** — full CRUD, stock tracking, weighted-average costing, decimal quantities (Kg), adjustment preview
- **Sales** — multi-line order workflow, stock deduction, COGS posting, invoice generation, payment recording, customer returns, credit allocation
- **Purchasing** — multi-line PO workflow, weight-based pricing, GRN with partial receiving, purchase returns with GRN linking, debit notes
- **Accounting/GL** — automated double-entry posting for all transactions, general ledger, P&L, cash/bank ledger
- **Payables/Receivables Aging** — real-time aging buckets (current, 1-30, 31-45, 46-60, 61+) from live transaction data
- **Expenses** — operating expense recording with GL integration
- **Reports Center** — stock valuation, stock movements, P&L, customer/supplier statements, GL drill-down
- **Dashboard** — live KPIs, alerts, and summary metrics

The AI assistant (`lib/business-assistant.ts`) still uses demo data for deterministic Q&A. A future Gemini implementation should use server-only credentials with tenant-scoped tools.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The root route redirects to `/dashboard`.

To exercise production authentication or database tooling, copy the required values from `.env.example` into a local `.env` file. Never commit real credentials.

## Environment Variables

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/business_os
```

- Clerk keys are required only when enabling live authentication.
- `DATABASE_URL` is required for database validation, migrations, and live data access.
- Gemini, WhatsApp, payments, and courier credentials are not used by this MVP.
- No secret is exposed from a client component.

## Database Architecture

`prisma/schema.prisma` defines 31 models. `Workspace` is the tenant root and business entities carry `workspaceId`. Membership is resolved through `WorkspaceMember`; all server-side repositories derive the active workspace from the authenticated user and never accept a client-supplied workspace ID as authorization.

Money is represented with PostgreSQL `Decimal(15,4)` fields. The schema covers users, workspaces, customers, suppliers, products, inventory transactions, sales and purchase orders with line items, goods received notes, supplier returns, invoices, payments, debit notes, customer credit allocations, ledger entries, general ledger entries, accounts, cash/bank accounts, expenses, audit logs, and more.

The initial migration is stored in `prisma/migrations`. Prisma uses `@prisma/adapter-pg`, with application database access centralized in `lib/server/db.ts`.

## AI Architecture

`BusinessAssistantService` separates the UI from the future model provider. `MockBusinessAssistantService` currently answers deterministic questions from centralized demo data and performs basic English/Roman Urdu intent matching for:

- Today and monthly sales context
- Customer outstanding balances
- Low-stock and product availability questions
- Top purchasing customer
- Payments received this month
- Overdue invoices

Write-like requests produce proposed actions only. For example, a payment-recording request returns a confirmation card with customer and amount. Confirming remains a non-persisted preview. A future Gemini implementation should use server-only credentials, tenant-scoped tools, explicit authorization, validation, confirmation, and audit logging.

## Routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Business overview and alerts |
| `/sales` | Searchable and filterable sales register |
| `/sales/new` | Multi-line sales order workflow |
| `/sales/[id]` | Sales order detail |
| `/customers` | Customer and credit directory |
| `/customers/new` | Validated customer form |
| `/customers/[id]` | Customer overview, khata, orders, payments, and invoices |
| `/customers/[id]/edit` | Edit customer form |
| `/khata` | Receivables and customer credit usage |
| `/inventory` | Product and stock register |
| `/inventory/new` | Validated product form |
| `/inventory/[id]` | Product detail, stock movements, and adjustment preview |
| `/inventory/[id]/edit` | Edit product form |
| `/suppliers` | Supplier register |
| `/suppliers/new` | Validated supplier form |
| `/suppliers/[id]` | Supplier detail, purchases, payments, and statements |
| `/suppliers/[id]/edit` | Edit supplier form |
| `/purchases` | Purchase order register |
| `/purchases/new` | Multi-line purchase order workflow |
| `/purchases/[id]` | Purchase order detail |
| `/purchases/[id]/receive` | GRN (goods receipt) workflow |
| `/goods-receipts` | Goods received note register |
| `/goods-receipts/[id]` | GRN detail |
| `/supplier-returns` | Supplier return register |
| `/supplier-returns/[id]` | Supplier return detail |
| `/invoices` | Invoice and collection register |
| `/receivables` | Receivables aging report |
| `/payables` | Payables aging report |
| `/accounting/cash-bank` | Cash and bank account management |
| `/accounting/cash-bank/[id]` | Cash/bank account detail |
| `/accounting/expenses` | Operating expense recording |
| `/reports` | Reports center |
| `/reports/current-stock` | Current stock valuation report |
| `/reports/stock-movement` | Stock movement report |
| `/reports/profit-loss` | Profit and loss statement |
| `/reports/general-ledger` | General ledger drill-down |
| `/reports/cash-bank` | Cash/bank ledger report |
| `/reports/customer-statement` | Customer statement |
| `/reports/supplier-statement` | Supplier statement |
| `/settings` | Business, users, preferences, invoices, security, and integrations |
| `/onboarding` | Validated business setup |
| `/ai` | Demo-backed BusinessOS assistant |

Global search in the top navigation covers customers, products, orders, and invoices and links to the relevant records.

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npx tsc --noEmit
npx prisma format
npx prisma validate
npx prisma generate
```

## Future Roadmap

1. Add audited Gemini tools with explicit user confirmation for every write action (replacing the demo AI assistant).
2. Add opt-in WhatsApp, payments, courier, and accounting integrations.
3. Batch N+1 query patterns in transaction endpoints for better performance at scale.
4. Add real-time inventory alerts and reorder notifications.
5. Add multi-user collaboration features (activity feed, comments on orders).
6. Add export/print for all reports (PDF, Excel).
