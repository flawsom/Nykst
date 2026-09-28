// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Vercel must receive its serverless Build Output API bundle. The shared
  // Lovable wrapper defaults to Cloudflare when no deployment target is set.
  nitro: { preset: "vercel" },
  vite: {
    // TypeScript's Node runtime probes __filename. Keep it external so Vercel's
    // Node runtime loads the package instead of inlining it into an ESM worker.
    ssr: { external: ["typescript"] },
    build: { rollupOptions: { external: ["typescript"] } },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
