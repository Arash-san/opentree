import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "dist/**",
        "dist-electron/**",
        "release/**",
        "src/renderer/**",
        "src/main/index.ts",
        "src/main/preload.ts",
        "src/main/scanner.worker.ts"
      ]
    }
  }
});
