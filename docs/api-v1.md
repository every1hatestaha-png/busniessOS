# BusinessOS API v1

All `/api/v1` routes require a Clerk session. Tenant scope comes exclusively from the authenticated user's validated `businessos_workspace` cookie, falling back to their oldest membership. Client-supplied workspace IDs are never used for authorization.

JSON responses use `{ "data": ... }` or `{ "error": { "code", "message" } }`.

| Method | Route | Permission | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/api/v1/suppliers` | read / financial | List and create suppliers |
| GET/PATCH/DELETE | `/api/v1/suppliers/:id` | read / financial | Supplier detail, update, safe delete |
| POST | `/api/v1/suppliers/:id/payments` | payments | Record supplier payment |
| GET/POST | `/api/v1/purchases` | read / financial | List and atomically receive purchases |
| POST | `/api/v1/sales/:id/cancel` | financial | Safely cancel a sale and its invoice |
| GET/POST | `/api/v1/members` | members | List members/invitations and invite |
| PATCH/DELETE | `/api/v1/members/:id` | members | Change role or remove non-owner |
| GET | `/api/v1/audit` | workspace | Cursor-paginated audit events |
| POST | `/api/v1/workspace/switch` | member | Validate membership and set active workspace |

Purchase creation requires an `Idempotency-Key` header (8-200 characters). The body includes `supplierId`, `items`, optional `paidAmount`, `paymentMethod`, and `notes`. Sale creation accepts its existing body key and clients should also supply `Idempotency-Key`; cancellation accepts `{ "reverseInitialPayment": true }` when the sale-time payment must be reversed. Cancellation is rejected if any later payment exists.

`POST /api/webhooks/clerk` verifies Svix headers with `CLERK_WEBHOOK_SECRET`, synchronizes Clerk users, and accepts matching pending invitations. Configure the endpoint in Clerk for `user.created`, `user.updated`, and `user.deleted`.

Purchase cancellation is intentionally deferred. Received purchases are immutable in Phase 2C.
