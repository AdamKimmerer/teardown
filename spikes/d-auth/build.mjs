// Bundles panel.src.js + supabase-js into panel.js for the unpacked extension.
//   node --env-file=../apps/api/.env d-auth/build.mjs      (from spikes/)
import { build } from "esbuild";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "SUPABASE_URL and SUPABASE_ANON_KEY are required in apps/api/.env",
  );
  process.exit(1);
}

await build({
  entryPoints: ["d-auth/panel.src.js"],
  outfile: "d-auth/panel.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
  define: {
    __SUPABASE_URL__: JSON.stringify(SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(SUPABASE_ANON_KEY),
  },
});
console.log("built d-auth/panel.js");
