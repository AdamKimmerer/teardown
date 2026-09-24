import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { exchangeCodeOnce, takeNextPath } from "../auth/signIn.js";

// Google sends the browser back here with ?code=…; exchanging it finishes sign-in.
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) {
      setError(params.get("error_description") ?? "Sign-in did not complete.");
      return;
    }
    exchangeCodeOnce(code)
      .then(() => navigate(takeNextPath(), { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [navigate]);

  if (error) {
    return (
      <p style={{ padding: 32 }}>
        <span className="error">{error}</span>{" "}
        <Link to="/login">Try again</Link>
      </p>
    );
  }
  return (
    <p style={{ padding: 32 }} className="muted">
      Signing you in…
    </p>
  );
}
