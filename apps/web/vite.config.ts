import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app is a static single-page app: `vite build` writes dist/, which any static host
// serves with a fallback to index.html for client-side routes.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
