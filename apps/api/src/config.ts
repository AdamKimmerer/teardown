import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  WEB_APP_URL: z.url().default("http://localhost:5173"),
});

const env = EnvSchema.parse(process.env);

// Every setting the API needs, read from the environment once at startup. Nothing else in the
// codebase touches process.env; import this instead.
export const config = {
  ...env,
  // Supabase Auth publishes the public keys that sign user JWTs here (verified 2026-09-19 against
  // supabase.com/docs/guides/auth/signing-keys).
  supabaseJwksUrl: new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL),
  // The `iss` claim Supabase puts in every access token.
  supabaseIssuer: `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`,
};
