import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the pure logic in utils/ — swing math, date handling,
 * session accounting, history statistics. These are the modules whose bugs
 * are silent: a wrong ratio or a UTC-vs-local date doesn't crash, it just
 * quietly reports the wrong number to the user.
 *
 * Deliberately no React Native renderer here. Everything under test is
 * plain TypeScript, and modules that touch AsyncStorage are stubbed per-test
 * so the suite runs in node with no native shims to maintain.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
  },
});
