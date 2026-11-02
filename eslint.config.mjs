import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "games/packages/*/dist/**",
    "games/apps/*/dist/**",
    "games/apps/*/.wrangler/**",
    "next-env.d.ts",
    // Installed design skills include third-party browser tooling.
    ".agents/skills/**",
  ]),
]);

export default eslintConfig;
