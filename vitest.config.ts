import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // See tests/stubs/server-only.ts for why this alias exists.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
