# BusinessOS

BusinessOS is a multi-tenant business operations workspace for Pakistani wholesalers and distributors. The local MVP brings sales, customer credit, khata, inventory, purchasing, invoices, suppliers, onboarding, search, and an AI-style business assistant into one responsive interface.

## Current Architecture

- Next.js App Router with server pages and focused client components for interactive tables and forms
- TypeScript in strict mode
- Tailwind CSS and shadcn/Base UI primitives
- Clerk provider and route-protection structure retained for production authentication
- Prisma/PostgreSQL schema with workspace-scoped business records
- Server-only Prisma repositories for workspaces, customers, products, search, and dashboard summaries
- Centralized demo data retained only for unfinished suppliers, purchases, settings, and AI modules
- Financial and business calculations in `lib/utils.ts`
- Provider-independent assistant contract in `lib/business-assistant.ts`

Phase 2B adds transactional sales, stock deductions, invoices, Khata ledger posting, customer payments, role authorization, editing, authenticated APIs, and automated transaction/isolation tests.

## Tech Stack

- Next.js 16 and React 19
- TypeScript 5
- Tailwind CSS 4
- shadcn/ui with Base UI
- Clerk
- Prisma and PostgreSQL
- React Hook Form and Zod
- Lucide icons

## Persistence Status

Customers and Inventory use the authenticated workspace and Neon PostgreSQL. Every read and write derives the workspace through Clerk identity, the local `User`, and `WorkspaceMember`; browser-provided workspace IDs are never authorization inputs.

The retained demo dataset supplies Suppliers, Purchases, Settings, and AI until their transactional services are implemented.

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

`prisma/schema.prisma` defines 14 models. `Workspace` is the tenant root and business entities carry `workspaceId`. Membership is resolved through `WorkspaceMember`; future server-side repositories must derive the active workspace from the authenticated user and must never accept a client-supplied workspace ID as authorization.

Money is represented with PostgreSQL `Decimal(15,2)` fields. The schema covers users, workspaces, customers, suppliers, products, inventory transactions, sales and purchase orders with line items, invoices, payments, and ledger entries.

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
| `/khata` | Receivables and customer credit usage |
| `/inventory` | Product and stock register |
| `/inventory/new` | Validated product form |
| `/inventory/[id]` | Product detail, stock movements, and adjustment preview |
| `/suppliers` | Supplier register |
| `/purchases` | Purchase order register |
| `/invoices` | Invoice and collection register |
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

1. Add Clerk sign-in, user synchronization, workspace selection, invitations, and role enforcement.
2. Add tenant-safe server repositories and transactional write workflows.
3. Create migrations and seed tooling for PostgreSQL.
4. Add payment allocation, invoice printing, returns, purchase receiving, and ledger reconciliation.
5. Add audited Gemini tools with explicit user confirmation for every write action.
6. Add tests for money calculations, stock movements, ledger posting, permissions, and tenant isolation.
7. Add opt-in WhatsApp, payments, courier, and accounting integrations.
