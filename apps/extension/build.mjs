// Builds the extension into dist/ with esbuild: four entry points, the manifest and static
// files copied over, and placeholder icons generated. `--watch` rebuilds on save.
//
//   node --env-file=.env build.mjs [--watch]
import { build, context } from "esbuild";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const watch = process.argv.includes("--watch");

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "API_URL",
  "WEB_APP_URL",
];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`${name} is required (see .env.example)`);
    process.exit(1);
  }
}

// Build-time constants; the code reads these instead of process.env (which does not exist).
const define = Object.fromEntries(
  required.map((name) => [`__${name}__`, JSON.stringify(process.env[name])]),
);

const common = {
  bundle: true,
  target: "chrome120",
  minify: true,
  sourcemap: true,
  logLevel: "info",
  define,
};

// The service worker is an ES module (manifest "type": "module"); the pages and the content
// script are plain scripts, so they are bundled as IIFEs.
const targets = [
  {
    ...common,
    entryPoints: ["src/service-worker.ts"],
    outfile: "dist/service-worker.js",
    format: "esm",
  },
  {
    ...common,
    entryPoints: {
      panel: "src/panel/panel.ts",
      offscreen: "src/offscreen/offscreen.ts",
      content: "src/content/content.ts",
      permission: "src/permission/permission.ts",
    },
    outdir: "dist",
    format: "iife",
  },
];

function copyStatic() {
  mkdirSync("dist/icons", { recursive: true });
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("src/panel/panel.html", "dist/panel.html");
  cpSync("src/panel/panel.css", "dist/panel.css");
  cpSync("src/offscreen/offscreen.html", "dist/offscreen.html");
  cpSync("src/permission/permission.html", "dist/permission.html");
  cpSync("src/permission/permission.css", "dist/permission.css");
  for (const size of [16, 48, 128]) {
    writeFileSync(
      `dist/icons/icon-${size}.png`,
      solidPng(size, size, [34, 170, 119]),
    );
  }
}

if (watch) {
  const contexts = await Promise.all(
    targets.map((t) =>
      context({
        ...t,
        plugins: [{ name: "copy-static", setup: (b) => b.onEnd(copyStatic) }],
      }),
    ),
  );
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(targets.map((t) => build(t)));
  copyStatic();
  console.log("built dist/");
}

// A solid-colour PNG: placeholder icons until there is a real one. Hand-encoded so the build
// needs no image library.
function solidPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
