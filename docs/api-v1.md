# MunshiOS API v1

All `/api/v1` routes require a Clerk session. Tenant scope comes exclusively from the authenticated user's validated `businessos_workspace` cookie, falling back to their oldest membership. Client-supplied workspace IDs are never used for authorization.

JSON responses use `{ "data": ... }` or `{ "error": { "code", "message" } }`.

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/api/v1/suppliers` | read / financial | List and create suppliers |
| GET/PATCH/DELETE | `/api/v1/suppliers/:id` | read / financial | Supplier detail, update, safe delete |
| POST | `/api/v1/suppliers/:id/payments` | payments | Record supplier payment |
| POST | `/api/v1/supplier-payments/:id/reverse` | financial | Reverse a posted supplier payment while preserving its audit trail |
| POST | `/api/v1/payments/:id/reverse` | financial | Reverse a standalone customer receipt while preserving its audit trail |
| POST | `/api/v1/supplier-returns/:id/cancel` | financial | Cancel a posted supplier return by restoring stock/payable and reversing its GL effect |
| GET/POST | `/api/v1/purchases` | read / financial | List and create purchase orders |
| POST | `/api/v1/sales/:id/cancel` | financial | Safely cancel a sale and its invoice |
| GET/POST | `/api/v1/members` | members | List members/invitations and invite |
| PATCH/DELETE | `/api/v1/members/:id` | members | Change role or remove non-owner |
| GET | `/api/v1/audit` | workspace | Cursor-paginated audit events |
| POST | `/api/v1/workspace/switch` | member | Validate membership and set active workspace |

Purchase creation requires an `Idempotency-Key` header (8-200 characters). The body includes `supplierId`, `items`, optional payment fields where supported, and notes. Sale creation accepts its existing body key and clients should also supply `Idempotency-Key`; cancellation accepts `{ "reverseInitialPayment": true }` when the sale-time payment must be reversed. Cancellation is rejected if any later payment exists.

Payment reversals accept `{ "reason": "..." }` and never delete the original payment. Customer receipt reversal restores customer receivable, invoice/sale allocation state, cash/bank and the corresponding general-ledger posting. A receipt captured during sale creation must be reversed through sale cancellation so revenue, stock, invoice and cash remain atomic. Supplier payment reversal restores gross payable and purchase allocations, returns the net cash amount, reverses WHT/general-ledger effects, and preserves the original voucher.

Supplier-return cancellation accepts `{ "reason": "..." }`. It keeps the posted return and debit-note history, marks the supplier return `CANCELLED`, restores the exact inventory carrying value removed by the original return, restores supplier and PO outstanding balances, records a reversal in the supplier ledger, reverses the original supplier-return GL entries, and writes an audit event. The original debit note remains as historical evidence and is displayed together with the cancelled return.

`POST /api/webhooks/clerk` verifies Svix headers with `CLERK_WEBHOOK_SECRET`, synchronizes Clerk users, and accepts matching pending invitations. Configure the endpoint in Clerk for `user.created`, `user.updated`, and `user.deleted`.

Posted financial history is reversed or voided rather than hard-deleted. Unposted draft lifecycles remain governed by their domain-specific safe-delete rules.
