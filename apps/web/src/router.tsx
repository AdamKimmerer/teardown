import { createBrowserRouter } from "react-router";
import { RequireAuth } from "./auth/RequireAuth.js";
import { Layout } from "./components/Layout.js";
import { AccountPage } from "./pages/AccountPage.js";
import { AuthCallbackPage } from "./pages/AuthCallbackPage.js";
import { LibraryPage } from "./pages/LibraryPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { SessionPage } from "./pages/SessionPage.js";

// Every screen and its URL (build plan §Web app). Signed-in pages sit inside RequireAuth.
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <LibraryPage /> },
          { path: "sessions/:id", element: <SessionPage /> },
          { path: "account", element: <AccountPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
