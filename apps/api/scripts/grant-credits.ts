// Grants promo credits to a user (spine §6.2: the launch promo is a post-purchase ledger
// grant, not a discount). Prints the new balance.
//
//   pnpm --filter @teardown/api grant-credits --email you@gmail.com [--credits 5]
import { grantCredits } from "../src/billing/ledger.js";
import { sql } from "../src/db/client.js";
import { creditBalanceForUser } from "../src/db/queries/credits.js";

const email = arg("--email");
const credits = Number(arg("--credits") ?? 5);
if (!email || !Number.isInteger(credits) || credits < 1) {
  console.error("usage: grant-credits --email <address> [--credits <n>]");
  process.exit(1);
}

const users = await sql<{ id: string }[]>`
  select id
  from users
  where lower(email) = lower(${email})
`;
if (users.length === 0) {
  console.error(`no Teardown user with email ${email} (sign in once first)`);
  process.exit(1);
}
const userId = users[0]!.id;
await grantCredits(userId, credits, "promo");
console.log(
  `granted ${credits} credit(s) to ${email}; balance is now ${await creditBalanceForUser(userId)}`,
);
await sql.end();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
