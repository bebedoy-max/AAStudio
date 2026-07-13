import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

function readProjectEnv() {
  return Object.fromEntries(
    readFileSync(new URL(".env", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
      }),
  );
}

// The preview runtime injects its former backend variables into process.env.
// Load this project's checked-in configuration explicitly so those stale
// values cannot replace the connected Supabase project in browser bundles.
const projectEnv = readProjectEnv();

// Also overwrite process.env for the server side (auth-middleware reads
// process.env.SUPABASE_*). The sandbox host may inject stale lovable.cloud
// values that mismatch the token issuer, causing "Unauthorized: Invalid token".
for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PROJECT_ID"]) {
  if (projectEnv[key]) process.env[key] = projectEnv[key];
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(projectEnv.VITE_SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      projectEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      projectEnv.VITE_SUPABASE_PROJECT_ID,
    ),
  },
  plugins: [
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    // Only apply Nitro Vercel preset in the actual Vercel build environment.
    // Locally / in the Lovable sandbox this would redirect output to .vercel/output
    // and break the default dist/ build check.
    ...(process.env.VERCEL ? [nitro({ preset: "vercel" })] : []),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "::",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
});
