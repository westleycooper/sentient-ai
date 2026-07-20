import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@contracts": resolve(__dirname, "../../packages/contracts/src"),
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
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 80 },
      exclude: ["src/api/generated/**", "src/test-setup.ts"],
    },
  },
});
