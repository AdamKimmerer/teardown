import type { TransactionSql } from "postgres";
import { sql } from "../db/client.js";

// The credit ledger (spine §6): append-only rows, balance = sum of deltas.

// Spends one credit for a generated session, inside the caller's transaction. Returns false,
// writing nothing, when the balance does not cover it.
//
// The insert is the build plan's single conditional statement. The row lock on the user comes
// first because the conditional alone is not enough under concurrency: two transactions could
// both read a balance of 1 before either inserts. Locking the user row makes spends for one user
// run one at a time, so the second sees the first's -1.
export async function spendCredit(
  tx: TransactionSql,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  await tx`
    select id
    from users
    where id = ${userId}
    for update
  `;
  const rows = await tx`
    insert into credit_ledger (user_id, delta, reason, session_id)
    select ${userId}, -1, 'spend', ${sessionId}
    where (select coalesce(sum(delta), 0) from credit_ledger where user_id = ${userId}) >= 1
    returning id
  `;
  return rows.length === 1;
}

// Adds credits. With a Stripe event id, a replayed webhook inserts nothing and returns false
// (the column is unique); promo grants pass null.
export async function grantCredits(
  userId: string,
  credits: number,
  reason: "purchase" | "promo" | "refund",
  stripeEventId: string | null = null,
): Promise<boolean> {
  const rows = await sql`
    insert into credit_ledger (user_id, delta, reason, stripe_event_id)
    values (${userId}, ${credits}, ${reason}, ${stripeEventId})
    on conflict (stripe_event_id) do nothing
    returning id
  `;
  return rows.length === 1;
}
