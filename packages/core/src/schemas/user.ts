import { z } from "zod";

// A Teardown user: one row in public.users, keyed to auth.users.id.
export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  createdAt: z.iso.datetime(),
});

export type User = z.infer<typeof UserSchema>;
