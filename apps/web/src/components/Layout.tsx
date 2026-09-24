import { Link, NavLink, Outlet } from "react-router";
import { supabase } from "../auth/supabase.js";
import { useAuth } from "../auth/useAuth.js";
import styles from "./Layout.module.css";

// The frame around every signed-in page: brand, navigation, who is signed in.
export function Layout() {
  const { session } = useAuth();

  return (
    <>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <img src="/favicon.svg" alt="" /> Teardown
        </Link>
        <nav className={styles.nav}>
          <NavLink to="/" end>
            Sessions
          </NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>
        <div className={styles.account}>
          <span>{session?.user.email}</span>
          {/* "local": sign out of this browser only. Supabase's default signs out every
              surface, which would also sign the extension out. */}
          <button
            className="quiet"
            onClick={() => void supabase.auth.signOut({ scope: "local" })}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </>
  );
}
