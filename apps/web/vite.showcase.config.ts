/**
 * Build config for the STANDALONE showcase site (GitHub Pages).
 *
 * Outputs a fully static bundle to docs/showcase/ (committed), so enabling
 * GitHub Pages with source = branch + /docs serves the page at
 *   https://<user>.github.io/sentient-ai/showcase/
 *
 * Regenerate with:  pnpm --filter sentient-web build:showcase
 * (the script also renames showcase.html -> index.html in the output).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "./", // relative asset URLs — works under any Pages subpath
  build: {
    outDir: resolve(__dirname, "../../docs/showcase"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "showcase.html"),
    },
  },
});
