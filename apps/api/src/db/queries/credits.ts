import { sql } from "../client.js";

// The user's current credit balance: the sum of their ledger rows, zero if there are none.
export async function creditBalanceForUser(userId: string): Promise<number> {
  const rows = await sql<{ balance: number }[]>`
    select balance
    from credit_balances
    where user_id = ${userId}
  `;
  return rows[0]?.balance ?? 0;
}
