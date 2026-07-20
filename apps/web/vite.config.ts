import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@contracts": resolve(__dirname, "../../packages/contracts/src"),
      // MUI v9's ESM build subpath-imports react-transition-group (e.g.
      // "react-transition-group/TransitionGroupContext") without a file
      // extension; that package only ships an ESM-resolvable entry at its
      // package root, so Node's strict ESM resolver (used by Vitest) rejects
      // the subpath as an unsupported directory import. Redirect to the CJS
      // build, which Vite's own resolver (unlike raw Node ESM) can still
      // resolve extensionlessly.
      "react-transition-group": "react-transition-group/cjs",
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // Force @mui/material's .mjs files through Vite's own transform/resolve
    // pipeline (where the react-transition-group alias above applies)
    // instead of Node's native ESM loader, which fails on MUI's extensionless
    // subpath import of react-transition-group.
    server: {
      deps: {
        inline: [/@mui\/.*/],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 80 },
      exclude: ["src/api/generated/**", "src/test-setup.ts"],
    },
  },
});
