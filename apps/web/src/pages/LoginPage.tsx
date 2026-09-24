import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { signInWithGoogle } from "../auth/signIn.js";
import { useAuth } from "../auth/useAuth.js";
import styles from "./LoginPage.module.css";

// Google sign-in. `next` is where the user was headed (e.g. a session the extension opened).
export function LoginPage() {
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const next = params.get("next") ?? "/";

  if (loading) return null;
  if (session)
    return <Navigate to={next.startsWith("/") ? next : "/"} replace />;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <img src="/favicon.svg" alt="" />
        <h1>Teardown</h1>
        <p>Your walkthroughs, turned into documents.</p>
        <button
          className="primary"
          onClick={() =>
            signInWithGoogle(next).catch((e: Error) => setError(e.message))
          }
        >
          Sign in with Google
        </button>
        {params.has("deleted") && (
          <p className={`${styles.notice} muted`}>
            Your account and everything in it has been deleted.
          </p>
        )}
        {error && <p className={`${styles.notice} error`}>{error}</p>}
      </div>
    </div>
  );
}
