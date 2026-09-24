import type { z } from "zod";
import { ErrorResponseSchema } from "@teardown/core/api-contract";
import { supabase } from "../auth/supabase.js";
import { config } from "../config.js";

// The API's error, with its HTTP status and machine code (402 out_of_credits, 422
// contract_failed, …) so screens can react to specific failures.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// One authenticated request to /v1, with the response parsed against the core contract. A 401
// means the session is no longer valid (expired, or the account was deleted), so the user is
// signed out and RequireAuth sends them to /login.
export async function apiRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body: unknown,
  schema: z.ZodType<T> | null,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "unauthenticated", "Not signed in");

  const res = await fetch(`${config.apiUrl}/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const parsed = ErrorResponseSchema.safeParse(
      await res.json().catch(() => null),
    );
    const error = parsed.success
      ? new ApiError(
          res.status,
          parsed.data.error.code,
          parsed.data.error.message,
        )
      : new ApiError(
          res.status,
          "http_error",
          `${method} ${path} failed (${res.status})`,
        );
    if (res.status === 401) await supabase.auth.signOut({ scope: "local" });
    throw error;
  }
  if (schema === null) return undefined as T;
  return schema.parse(await res.json());
}
