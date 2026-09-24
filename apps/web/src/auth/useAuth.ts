import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export type AuthState = { session: Session | null; loading: boolean };

// The current Supabase session, kept up to date as the user signs in, out, or is refreshed.
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: true,
  });

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState({ session, loading: false }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}
