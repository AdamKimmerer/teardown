// Spike D panel: the extension sign-in path from the build plan §Auth.
//   launchWebAuthFlow (response_type=id_token, hashed nonce)
//   → Google ID token in the redirect fragment
//   → supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })
//   → session persisted in chrome.storage.local through a custom storage adapter
//   → GET http://localhost:3000/v1/me with the Supabase access token
// Built into panel.js by build.mjs, which injects SUPABASE_URL and SUPABASE_ANON_KEY.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = __SUPABASE_URL__;
const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;
const API_URL = "http://localhost:3000";

const $ = (id) => document.getElementById(id);
const log = (line) => {
  $("log").textContent += line + "\n";
  $("log").scrollTop = $("log").scrollHeight;
};
function verdict(text, pass) {
  $("verdict").textContent = text;
  $("verdict").className =
    "verdict " + (pass === undefined ? "" : pass ? "pass" : "fail");
}

// supabase-js wants a localStorage-like object; chrome.storage.local is async, which it accepts.
const chromeStorage = {
  getItem: async (key) => (await chrome.storage.local.get(key))[key] ?? null,
  setItem: async (key, value) => chrome.storage.local.set({ [key]: value }),
  removeItem: async (key) => chrome.storage.local.remove(key),
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

function randomString(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// Google gets the hashed nonce; Supabase gets the raw one and checks hash(raw) === token.nonce.
async function signInWithGoogle() {
  const manifest = chrome.runtime.getManifest();
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const rawNonce = randomString(16);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", manifest.oauth2.client_id);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", manifest.oauth2.scopes.join(" "));
  url.searchParams.set("nonce", await sha256Hex(rawNonce));
  url.searchParams.set("prompt", "select_account");
  log(`redirect_uri: ${redirectUri}`);

  const redirectedTo = await chrome.identity.launchWebAuthFlow({
    url: url.href,
    interactive: true,
  });
  const fragment = new URLSearchParams(new URL(redirectedTo).hash.slice(1));
  const idToken = fragment.get("id_token");
  if (!idToken) throw new Error(`no id_token in redirect: ${redirectedTo}`);
  log(`got Google ID token (${idToken.length} chars)`);

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: rawNonce,
  });
  if (error) throw new Error(`signInWithIdToken: ${error.message}`);
  return data.session;
}

async function showSession() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  $("who").textContent = session
    ? `${session.user.email} (expires ${new Date(session.expires_at * 1000).toLocaleTimeString()})`
    : "nobody";
  return session;
}

$("extid").textContent = chrome.runtime.id;

$("signin").addEventListener("click", async () => {
  try {
    const session = await signInWithGoogle();
    log(
      `Supabase session for ${session.user.email}; provider ${session.user.app_metadata.provider}`,
    );
    verdict(`PASS: signed in as ${session.user.email}`, true);
    await showSession();
  } catch (err) {
    log(`sign-in FAILED: ${err.message}`);
    verdict(`FAIL: ${err.message}`, false);
  }
});

$("me").addEventListener("click", async () => {
  const session = await showSession();
  if (!session) return verdict("sign in first", false);
  try {
    const res = await fetch(`${API_URL}/v1/me`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.text();
    log(`GET /v1/me → ${res.status} ${body}`);
    verdict(
      res.ok
        ? `PASS: API accepted the token (${body})`
        : `FAIL: API said ${res.status}`,
      res.ok,
    );
  } catch (err) {
    log(
      `GET /v1/me failed: ${err.message} (is the API running? pnpm --filter @teardown/api dev)`,
    );
    verdict(`FAIL: ${err.message}`, false);
  }
});

$("refresh").addEventListener("click", async () => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    log(`refresh FAILED: ${error.message}`);
    return verdict(`FAIL: refresh: ${error.message}`, false);
  }
  log(
    `refreshed; new expiry ${new Date(data.session.expires_at * 1000).toLocaleTimeString()}`,
  );
  verdict("PASS: token refreshed through chrome.storage.local adapter", true);
  await showSession();
});

$("signout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  log("signed out");
  verdict("signed out");
  await showSession();
});

showSession().then(
  (s) =>
    s && log(`restored session from chrome.storage.local: ${s.user.email}`),
);
