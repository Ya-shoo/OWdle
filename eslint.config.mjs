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
    "next-env.d.ts",
    // Standalone Chrome extension — vanilla web-extension JS (chrome.*,
    // importScripts) that isn't part of the Next app graph. Linting it here
    // would flag web-extension globals as no-undef.
    "extension/**",
  ]),
]);

export default eslintConfig;
