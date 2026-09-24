import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./useAuth.js";

// Wraps every signed-in route: shows nothing while the session loads, sends signed-out
// visitors to /login with a note of where they were going.
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (session === null) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
