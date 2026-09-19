import { z } from "zod";

export const CreditReasonSchema = z.enum([
  "purchase",
  "promo",
  "spend",
  "refund",
]);

export type CreditReason = z.infer<typeof CreditReasonSchema>;

// One append-only ledger row. A user's balance is the sum of their deltas.
export const CreditLedgerEntrySchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  delta: z.number().int(),
  reason: CreditReasonSchema,
  // Set on purchase rows; unique in the database so a replayed Stripe webhook is a no-op.
  stripeEventId: z.string().nullable(),
  sessionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntrySchema>;

// The two prepaid packs sold at launch (spine §6). Stripe Price IDs live in API config, not here.
export const PackIdSchema = z.enum(["pack_5", "pack_15"]);

export type PackId = z.infer<typeof PackIdSchema>;

export const PACKS: Record<PackId, { credits: number; priceUsd: number }> = {
  pack_5: { credits: 5, priceUsd: 39 },
  pack_15: { credits: 15, priceUsd: 99 },
};
