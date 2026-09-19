import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { config } from "../config.js";

// Fetched once and cached by jose; refreshed automatically when an unknown key id appears.
const supabaseKeys = createRemoteJWKSet(config.supabaseJwksUrl);

// Verifies the Supabase access token in the Authorization header and puts its user id on the
// context. Applied to every /v1 route except the Stripe webhook and the Notion OAuth callback.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c.req.header("authorization"));
  if (token === null) {
    throw new AppError("unauthenticated", 401, "Missing bearer token");
  }

  const userId = await verifySupabaseToken(token);
  c.set("userId", userId);
  await next();
});

// Pulls the token out of "Bearer <token>", or null if the header is absent or malformed.
function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

// Checks signature, issuer, audience and expiry; returns the `sub` claim (the auth.users id).
async function verifySupabaseToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, supabaseKeys, {
      issuer: config.supabaseIssuer,
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string") {
      throw new Error("token has no sub");
    }
    return payload.sub;
  } catch {
    throw new AppError("unauthenticated", 401, "Invalid or expired token");
  }
}
