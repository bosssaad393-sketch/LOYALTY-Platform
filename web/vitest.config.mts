import path from "node:path";
import { defineConfig } from "vitest/config";

// Lets tests import route files that use the "@/..." shortcut (same as tsconfig paths).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Some tests build a whole database, which can pass the default 5 s when the machine is busy.
  test: { testTimeout: 30_000 },
});
