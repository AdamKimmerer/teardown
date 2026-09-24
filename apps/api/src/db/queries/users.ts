import type { User } from "@teardown/core/schemas/user";
import { sql } from "../client.js";

// Looks up a user by their auth.users id; null if the row does not exist or is being deleted.
export async function findUserById(id: string): Promise<User | null> {
  const rows = await sql<{ id: string; email: string; created_at: Date }[]>`
    select id, email, created_at
    from users
    where id = ${id}
      and deleted_at is null
  `;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

// Marks an account as being deleted, so it cannot act while its objects are removed. The row
// itself goes when the auth user is deleted (on delete cascade).
export async function markUserDeleting(id: string): Promise<void> {
  await sql`
    update users
    set deleted_at = now()
    where id = ${id}
  `;
}
