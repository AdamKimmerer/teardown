// LOCAL DEVELOPMENT ONLY. Gets a real Supabase access token for an existing user by email, so a
// script can call the API as that user (e.g. your Google account) without a browser. It uses the
// service-role key to mint a magic-link token and exchanges it immediately; no email is sent.
// Never import this from src/: nothing that ships may be able to act as a user.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };

export async function devAccessToken(email: string): Promise<string> {
  const admin = createClient(url, serviceKey, options);
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error) throw new Error(`generateLink: ${link.error.message}`);

  const anon = createClient(url, anonKey, options);
  const verified = await anon.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error || !verified.data.session)
    throw new Error(`verifyOtp: ${verified.error?.message}`);
  return verified.data.session.access_token;
}

// Ends the session devAccessToken created, so scripts do not leave logins behind.
export async function revokeDevAccessToken(accessToken: string): Promise<void> {
  const admin = createClient(url, serviceKey, options);
  await admin.auth.admin.signOut(accessToken, "local");
}
