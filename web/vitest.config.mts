import path from "node:path";
import { defineConfig } from "vitest/config";

// Lets tests import route files that use the "@/..." shortcut (same as tsconfig paths).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
