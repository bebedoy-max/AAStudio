// Build per-provider browser extensions from the shared `extension/` source.
// Usage: bun scripts/build-plugin-extensions.mjs [appUrl]
// Output: public/plugins/aa-token-grabber-<provider>.zip
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "extension");
const OUT = path.join(ROOT, "public", "plugins");
const TMP = path.join(ROOT, ".plugin-build");
const APP_URL = process.argv[2] || "https://aacreative.vercel.app/";

const VARIANTS = [
  {
    id: "leonardo",
    name: "AA Grabber — Leonardo.ai",
    version: "3.0.0",
    hosts: ["https://app.leonardo.ai/*", "https://*.leonardo.ai/*", "https://cloud.leonardo.ai/*"],
  },
  {
    id: "framia",
    name: "AA Grabber — Framia",
    version: "3.0.0",
    hosts: [
      "https://framia.converge.ai/*",
      "https://*.converge.ai/*",
      "https://api.framia.pro/*",
      "https://*.framia.pro/*",
    ],
  },
];

const APP_HOSTS = [
  "http://localhost:*/*",
  "https://*.lovable.app/*",
  "https://*.lovable.dev/*",
  "https://*.vercel.app/*",
];

const providersSrc = readFileSync(path.join(SRC, "providers.js"), "utf8");
const popupHtmlSrc = readFileSync(path.join(SRC, "popup.html"), "utf8");

function providersFor(id) {
  // Keep only the requested provider object from the shared registry.
  const start = providersSrc.indexOf("self.AA_PROVIDERS = [");
  const body = providersSrc.slice(start);
  const blocks = body.split(/\n  \{\n/).slice(1);
  const wanted = blocks.find((b) => b.includes(`id: "${id}"`));
  if (!wanted) throw new Error(`provider ${id} not found`);
  const cleaned = wanted.replace(/\n  \},[\s\S]*$/, "\n  },");
  return `self.AA_PROVIDERS = [\n  {\n${cleaned}\n];\n`;
}

function popupHtmlFor(v) {
  let html = popupHtmlSrc;
  // Firefly relay is not part of the per-provider builds.
  html = html.replace(/\s*<button data-tab="relay">Relay<\/button>/, "");
  html = html.replace(/<main id="tab-relay"[\s\S]*?<\/main>\n/, "");
  html = html.replace(/<h1>[^<]*<\/h1>/, `<h1>${v.name}</h1>`);
  html = html.replace(
    "<script src=\"providers.js\"></script>",
    "<script src=\"config.js\"></script>\n<script src=\"providers.js\"></script>",
  );
  return html;
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const v of VARIANTS) {
  const dir = path.join(TMP, v.id);
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        manifest_version: 3,
        name: v.name,
        version: v.version,
        description: `Ambil token ${v.name.split("— ")[1]} otomatis dan sinkronkan ke Token Manager akun AA Creative Studio kamu.`,
        permissions: ["activeTab", "scripting", "storage", "cookies", "webRequest", "tabs", "alarms", "notifications"],
        host_permissions: [...v.hosts, ...APP_HOSTS],
        background: { service_worker: "background.js" },
        action: { default_popup: "popup.html", default_icon: "icon.png", default_title: v.name },
        icons: { 48: "icon.png", 128: "icon.png" },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.join(dir, "config.js"),
    `// Dikunci oleh admin AA Creative Studio — jangan diubah.\nself.AA_CONFIG = ${JSON.stringify(
      { appUrl: APP_URL, providerId: v.id, lockAccount: true },
      null,
      2,
    )};\n`,
  );

  writeFileSync(path.join(dir, "providers.js"), providersFor(v.id));
  writeFileSync(path.join(dir, "popup.html"), popupHtmlFor(v));
  for (const f of ["background.js", "popup.js", "icon.png"]) {
    copyFileSync(path.join(SRC, f), path.join(dir, f));
  }
  // background.js pulls the registry; make sure config loads first too.
  const bg = readFileSync(path.join(dir, "background.js"), "utf8").replace(
    'importScripts("providers.js");',
    'importScripts("config.js", "providers.js");',
  );
  writeFileSync(path.join(dir, "background.js"), bg);

  const zipPath = path.join(OUT, `aa-token-grabber-${v.id}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync("nix", ["run", "nixpkgs#zip", "--", "-r", "-q", zipPath, "."], { cwd: dir, stdio: "inherit" });
  console.log("built", zipPath);
}

rmSync(TMP, { recursive: true, force: true });
