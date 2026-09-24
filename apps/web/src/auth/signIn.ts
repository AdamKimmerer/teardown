import { supabase } from "./supabase.js";

// Where to go after sign-in survives the round trip to Google in sessionStorage, so a link from
// the extension (/sessions/:id) lands on that session once the user has signed in.
const NEXT_KEY = "teardown.next";

export async function signInWithGoogle(next: string): Promise<void> {
  try {
    sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    // Storage blocked: the user lands on the library instead. Not worth failing sign-in over.
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

// The path to return to after sign-in, once; only same-site paths are honoured.
export function takeNextPath(): string {
  let next: string | null = null;
  try {
    next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // Storage blocked: fall through to the library.
  }
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

// A code can be exchanged only once, and React runs effects twice in development, so the
// exchange for each code is shared.
const exchanges = new Map<string, Promise<void>>();

export function exchangeCodeOnce(code: string): Promise<void> {
  let exchange = exchanges.get(code);
  if (exchange === undefined) {
    exchange = supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) throw error;
    });
    exchanges.set(code, exchange);
  }
  return exchange;
}
