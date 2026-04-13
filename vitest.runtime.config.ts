import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/runtime-smoke.test.ts"],
    reporters: ["default"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    pool: "forks",
  },
});
