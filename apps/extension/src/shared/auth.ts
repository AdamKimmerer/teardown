import { createClient, type Session } from "@supabase/supabase-js";
import { buildConfig } from "./buildConfig.js";

// Google sign-in for the extension (build plan §Auth setup): launchWebAuthFlow gets a Google
// ID token, Supabase turns it into a session, and the session lives in chrome.storage.local.
// Only the service worker imports this, so there is exactly one Supabase client.

// supabase-js wants a localStorage-like object; chrome.storage.local is async, which it accepts.
const chromeStorage = {
  getItem: async (key: string) =>
    ((await chrome.storage.local.get(key))[key] as string) ?? null,
  setItem: async (key: string, value: string) =>
    chrome.storage.local.set({ [key]: value }),
  removeItem: async (key: string) => chrome.storage.local.remove(key),
};

const supabase = createClient(
  buildConfig.supabaseUrl,
  buildConfig.supabaseAnonKey,
  {
    auth: {
      storage: chromeStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

// Opens Google's sign-in in a popup and exchanges the ID token for a Supabase session.
export async function signInWithGoogle(): Promise<Session> {
  const manifest = chrome.runtime.getManifest();
  const rawNonce = randomHex(16);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", manifest.oauth2!.client_id);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set(
    "redirect_uri",
    `https://${chrome.runtime.id}.chromiumapp.org/`,
  );
  url.searchParams.set("scope", manifest.oauth2!.scopes!.join(" "));
  // Google gets the hash; Supabase gets the raw nonce and checks hash(raw) === token.nonce.
  url.searchParams.set("nonce", await sha256Hex(rawNonce));
  url.searchParams.set("prompt", "select_account");

  const redirectedTo = await chrome.identity.launchWebAuthFlow({
    url: url.href,
    interactive: true,
  });
  if (!redirectedTo) throw new Error("Sign-in was cancelled");
  const idToken = new URLSearchParams(new URL(redirectedTo).hash.slice(1)).get(
    "id_token",
  );
  if (!idToken) throw new Error("Google did not return an ID token");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: rawNonce,
  });
  if (error || !data.session)
    throw new Error(error?.message ?? "Sign-in failed");
  return data.session;
}

// The current session, refreshed by supabase-js if the access token has expired; null if signed out.
export async function getAuthSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// A bearer token for the API, or null when signed out.
export async function getAccessToken(): Promise<string | null> {
  const session = await getAuthSession();
  return session?.access_token ?? null;
}

// Signs out of the extension only; the web app stays signed in ("local" scope). Signing out
// everywhere is what Delete account does.
export async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
