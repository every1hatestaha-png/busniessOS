import { z } from "zod";

/** An owner's factual declaration, never independent tax/legal certification. */
export const ownerBillingDeclarationSchema = z.object({
  draftVersion: z.number().int().nonnegative(),
  reference: z.string().trim().min(8).max(160),
  basis: z.string().trim().min(40).max(1000),
  taxTimingAssessed: z.literal(true),
  noEarlierInvoiceObligation: z.literal(true),
  responsibilityAcknowledged: z.literal(true),
});

export type OwnerBillingDeclaration = z.infer<typeof ownerBillingDeclarationSchema>;

export const ownerBillingAuditSchema = ownerBillingDeclarationSchema.extend({
  version: z.literal(1),
  kind: z.literal("OWNER_DECLARATION_NOT_INDEPENDENT_CLEARANCE"),
  actorRole: z.literal("OWNER"),
  customerId: z.string(),
  gatePassCreatedAt: z.string().datetime(),
});
